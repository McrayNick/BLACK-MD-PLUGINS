module.exports = [
  
  {
    command: ['enc'],
    aliases: ['encrypte'],
    description: 'Obfuscate/encrypt JavaScript code',
    category: 'coding',
    handler: async (client, m, { reply }) => {
      const Obf = require('javascript-obfuscator');
      if (!m.quoted || !m.quoted.text) return m.reply('Quote/Tag a valid JavaScript code to encrypt!');
      const obfuscationResult = Obf.obfuscate(m.quoted.text, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        numbersToExpressions: true,
        simplify: true,
        stringArrayShuffle: true,
        splitStrings: true,
        stringArrayThreshold: 1
      });
      m.reply(obfuscationResult.getObfuscatedCode());
    }
  },

  {
    command: ['gpass'],
    aliases: ['genpassword'],
    description: 'Generate a strong password',
    category: 'coding',
    handler: async (client, m, { reply, text }) => {
      const length = parseInt(text) || 16;
      if (length < 4 || length > 64) return reply('Password length must be between 4 and 64.');
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
      let password = '';
      for (let i = 0; i < length; i++) password += chars[Math.floor(Math.random() * chars.length)];
      m.reply(`🔐 *Generated Password (${length} chars):*\n\`${password}\`\n\n_Keep this safe!_`);
      m.reply(password);
    }
  },
  
  {
    command: ['compile-py'],
    aliases: ['run-py'],
    description: 'Run Python code',
    category: 'coding',
    handler: async (client, m, { reply, text }) => {
      if (!text && !m.quoted) return reply('Quote/tag a python code to compile.');
      const { python } = require('compile-run');
      const sourcecode = m.quoted?.text || text || m.text;
      python.runSource(sourcecode)
        .then(result => {
          if (result.stdout) reply(result.stdout);
          if (result.stderr) reply(result.stderr);
        })
        .catch(err => reply(String(err)));
    }
  },

  {
    command: ['compile-js'],
    aliases: ['run-js'],
    description: 'Run JavaScript code',
    category: 'coding',
    handler: async (client, m, { reply, text }) => {
      if (!text && !m.quoted) return reply('Quote/tag a Js code to compile.');
      const { node } = require('compile-run');
      const sourcecode = m.quoted?.text || text || m.text;
      node.runSource(sourcecode)
        .then(result => {
          if (result.stdout) reply(result.stdout);
          if (result.stderr) reply(result.stderr);
        })
        .catch(err => reply(String(err)));
    }
  },

  {
    command: ['compile-c'],
    aliases: ['run-c'],
    description: 'Compile and run C code',
    category: 'coding',
    handler: async (client, m, { reply, text }) => {
      if (!text && !m.quoted) return reply('Quote/tag a C code to compile');
      const { c } = require('compile-run');
      const sourcecode = m.quoted?.text || text || m.text;
      c.runSource(sourcecode)
        .then(result => {
          if (result.stdout) reply(result.stdout);
          if (result.stderr) reply(result.stderr);
        })
        .catch(err => reply(String(err)));
    }
  },

  {
    command: ['compile-c++'],
    aliases: ['run-c++'],
    description: 'Compile and run C++ code',
    category: 'coding',
    handler: async (client, m, { reply, text }) => {
      if (!text && !m.quoted) return reply('Quote/tag a C++ code to compile');
      const { cpp } = require('compile-run');
      const sourcecode = m.quoted?.text || text || m.text;
      cpp.runSource(sourcecode)
        .then(result => {
          if (result.stdout) reply(result.stdout);
          if (result.stderr) reply(result.stderr);
        })
        .catch(err => reply(String(err)));
    }
  },
  
  ];
