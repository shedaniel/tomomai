import * as readline from 'readline';
import { encryptToken, decryptToken } from '../src/lib/token-crypto.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  try {
    const secret = await question('Enter TOKEN_SECRET: ');
    if (!secret) {
      console.error('TOKEN_SECRET is required');
      rl.close();
      process.exit(1);
    }
    process.env.TOKEN_SECRET = secret.trim();

    const text = await question('Enter text: ');
    if (!text) {
      console.error('Text is required');
      rl.close();
      process.exit(1);
    }

    const action = await question('Action (encrypt/decrypt): ');
    const trimmedAction = action.trim().toLowerCase();

    if (trimmedAction === 'encrypt') {
      const encrypted = encryptToken(text);
      console.log('Encrypted:', encrypted);
    } else if (trimmedAction === 'decrypt') {
      const decrypted = decryptToken(text);
      console.log('Decrypted:', decrypted);
    } else {
      console.error('Invalid action. Use "encrypt" or "decrypt"');
      rl.close();
      process.exit(1);
    }

    rl.close();
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    rl.close();
    process.exit(1);
  }
}

main();
