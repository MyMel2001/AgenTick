const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const { settings } = require('../db');
const { callLLM } = require('../tools/llm');
const { toolDefinitions, executeTool } = require('../tools');

router.use(requireAuth);

const MAX_TOOL_ITERATIONS = 10;

// POST /api/chat — main agentic chat endpoint with SSE streaming
router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { message, conversationHistory } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Get user settings for system prompt
    const userSettings = await settings.get(`settings_${userId}`) || {};
    const identity = userSettings.identity || 'a helpful user';
    const displayName = userSettings.displayName || req.session.username;

    // Get user scripts to inject as tools
    const { scripts: userScripts } = require('../db');
    const allScripts = await userScripts.all();
    const prefix = `script_${userId}_`;
    const dynamicTools = allScripts
      .filter(s => s.id.startsWith(prefix))
      .map(s => {
        const script = s.value;
        return {
          type: 'function',
          function: {
            name: `user_script_${script.id.replace(/-/g, '_')}`,
            description: `[USER CUSTOM TOOL] ${script.name}: ${script.description}`,
            parameters: {
              type: 'object',
              properties: {
                args: { type: 'string', description: 'Arguments to pass to the script' }
              }
            }
          },
          script: script // Keep for execution
        };
      });

    const currentTools = [...toolDefinitions, ...dynamicTools.map(dt => ({ type: dt.type, function: dt.function }))];

    const systemPrompt = `You are AgenTick AI, the primary interface for the AgenTick Operating Environment. You are NOT just a chatbot; you ARE the operating environment itself. You help the user manage their digital life, files, and tasks directly through this chat interface.

About the user:
- Name: ${displayName}
- Identity/context: ${identity}

You have access to these core environmental capabilities:
1. **note** — Manage the user's encrypted thoughts and notes
2. **go_to_url** — Browse the web on behalf of the user
3. **web_search** — Search for information online
4. **go_to_link** — Navigate intelligently through web pages
5. **save_file_from_net** — Retrieve and encrypt files from the internet
6. **limited_cli** — Execute low-level system commands in the virtual shell
7. **file_read/write/append** — Manipulate the user's encrypted filesystem
8. **get_current_time** — Retrieve the current system time and date

CUSTOM EXTENSIONS (Created by user):
${dynamicTools.map(dt => `- **${dt.function.name}**: ${dt.function.description}`).join('\n')}

Philosophy:
- You are the central hub. All actions (opening files, checking weather, scheduling tasks) happen through you.
- Be proactive and agentic. If a user asks for something, use your tools to provide the result directly in the chat.
- The UI is minimalist; you provide the complexity and the results.
- Current date/time: ${new Date().toISOString()}`;

    // Build messages array
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-20)) { // Keep last 20 messages
        messages.push(msg);
      }
    }

    messages.push({ role: 'user', content: message });

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Agentic loop
    const context = { userId, currentPageUrl: null, currentPageLinks: [] };
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      sendEvent('status', { message: iteration === 1 ? 'Thinking...' : `Processing (step ${iteration})...` });

      let response;
      try {
        response = await callLLM(messages, { tools: currentTools.length > 0 ? currentTools : undefined });
      } catch (err) {
        sendEvent('error', { message: `LLM error: ${err.message}` });
        res.write('event: done\ndata: {}\n\n');
        return res.end();
      }

      const choice = response.choices?.[0];
      if (!choice) {
        sendEvent('error', { message: 'No response from LLM' });
        res.write('event: done\ndata: {}\n\n');
        return res.end();
      }

      const assistantMessage = choice.message;

      // If there are tool calls, execute them
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.id.startsWith('user_script_') || toolCall.function.name.startsWith('user_script_') ? toolCall.function.name : toolCall.function.name;
          let toolArgs;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (_) {
            toolArgs = {};
          }

          sendEvent('tool_start', { tool: toolName, args: toolArgs, callId: toolCall.id });

          let result;
          try {
            if (toolName.startsWith('user_script_')) {
              // Execute user script via LLM interpreter
              const scriptId = toolName.replace('user_script_', '').replace(/_/g, '-');
              const scriptKey = `script_${userId}_${scriptId}`;
              const { scripts: userScriptsTable } = require('../db');
              const script = await userScriptsTable.get(scriptKey);
              
              if (!script) {
                result = JSON.stringify({ error: 'User script not found' });
              } else {
                const { askLLM } = require('../tools/llm');
                const executionPrompt = `You are a script execution engine for AgenTick OS. 
                Execute this "vibe-coded" script:
                NAME: ${script.name}
                DESCRIPTION: ${script.description}
                CODE:
                ${script.code}
                
                ARGUMENTS PROVIDED:
                ${toolArgs.args || 'None'}
                
                Execute the script and provide the final output. If the script describes a process, follow it and report the result.`;
                result = await askLLM('You execute vibe-coded scripts. Provide ONLY the result/output.', executionPrompt);
              }
            } else {
              result = await executeTool(toolName, toolArgs, context);
            }
          } catch (err) {
            result = JSON.stringify({ error: err.message });
          }

          sendEvent('tool_result', { tool: toolName, result: result.substring(0, 2000), callId: toolCall.id });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        }

        // Continue the loop to let LLM process tool results
        continue;
      }

      // No tool calls — final text response
      const content = assistantMessage.content || '';
      sendEvent('message', { content, role: 'assistant' });
      break;
    }

    if (iteration >= MAX_TOOL_ITERATIONS) {
      sendEvent('message', { content: 'I reached the maximum number of tool steps. Here\'s what I have so far — please let me know if you need more help.', role: 'assistant' });
    }

    res.write('event: done\ndata: {}\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat failed' });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  }
});

module.exports = router;
