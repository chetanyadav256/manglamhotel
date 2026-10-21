import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { readEnv } from '../config/env.js';
import Admin from '../models/Admin.js';
import argon2 from 'argon2';
import { isStrongAdminPassword, isValidAdminEmail, normalizeAdminEmail } from '../security/adminAuth.js';

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command from an interactive terminal.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Admin creation cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function createInitialAdmin() {
  const { mongodbUri } = readEnv();
  if (!mongodbUri) throw new Error('MONGODB_URI is required to create an admin account.');

  const prompt = createInterface({ input: stdin, output: stdout });
  let email;
  try {
    email = normalizeAdminEmail(await prompt.question('Admin email: '));
  } finally {
    prompt.close();
  }
  if (!isValidAdminEmail(email)) throw new Error('Enter a valid email address.');

  const password = await readHidden('Password (hidden): ');
  const confirmation = await readHidden('Confirm password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (!isStrongAdminPassword(password)) {
    throw new Error('Password must be 6-20 characters and include lowercase, uppercase, and a number.');
  }

  try {
    await connectDatabase(mongodbUri);
  } catch (error) {
    throw new Error('MongoDB connection failed; verify server configuration and connectivity.', { cause: error });
  }
  let existingAdmin;
  try {
    existingAdmin = await Admin.exists({ email });
  } catch (error) {
    throw new Error('Unable to verify the admin account due to a database error.', { cause: error });
  }
  if (existingAdmin) throw new Error('An admin account already exists for that email.');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    await Admin.create({ email, passwordHash, isActive: true });
  } catch (error) {
    if (error.code === 11000) {
      throw new Error('An admin account already exists for that email.', { cause: error });
    }
    throw new Error('Admin account could not be created due to a database error.', { cause: error });
  }

  console.log('Admin account created.');
}

try {
  await createInitialAdmin();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    await mongoose.disconnect();
  } catch {
    console.error('Database disconnect failed.');
    process.exitCode = 1;
  }
}
