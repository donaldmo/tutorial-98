#!/usr/bin/env node

import { execSync } from 'child_process';
import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';


dotenv.config()

// Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'z-ai/glm-4.5-air:free';

if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY environment variable not set');
  console.error('Set it with: export OPENROUTER_API_KEY="your-key-here"');
  process.exit(1);
}

const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY
});

async function getStagedDiff() {
  try {
    const diff = execSync('git diff --cached', { encoding: 'utf-8' });
    
    if (!diff.trim()) {
      console.error('No staged changes found. Stage files with: git add <files>');
      process.exit(1);
    }
    
    // Get list of staged files for context
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    
    return { diff, stagedFiles };
  } catch (error) {
    console.error('Error getting git diff:', error.message);
    process.exit(1);
  }
}

async function generateWithAI(prompt) {
  try {
    const completion = await openrouter.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 100,
      stream: true
    });

    let fullResponse = '';
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        process.stdout.write(content);
      }
    }
    console.log('\n'); // New line after streaming
    
    return fullResponse;
  } catch (error) {
    throw new Error(`OpenRouter API error: ${error.message}`);
  }
}

async function generateCommitMessage() {
  console.log('🔍 Analyzing staged changes...\n');
  
  const { diff, stagedFiles } = await getStagedDiff();
  
  console.log('Staged files:');
  console.log(stagedFiles);
  
  // Truncate diff if too long (API has token limits)
  const maxDiffLength = 3000;
  const truncatedDiff = diff.length > maxDiffLength 
    ? diff.substring(0, maxDiffLength) + '\n... (diff truncated)'
    : diff;
  
  const prompt = `Generate a brief, conventional commit message for these git changes. 
Use the format: type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
Keep it under 72 characters and be specific but concise.

Staged files:
${stagedFiles}

Git diff:
${truncatedDiff}

Commit message:`;

  console.log('🤖 Generating commit message...\n');
  
  try {
    const commitMessage = await generateWithAI(prompt);
    
    console.log('━'.repeat(60));
    console.log('\nTo use this message, run:');
    console.log(`git commit -m "${commitMessage.trim()}"`);
    
  } catch (error) {
    console.error('Error generating commit message:', error.message);
    process.exit(1);
  }
}

generateCommitMessage();