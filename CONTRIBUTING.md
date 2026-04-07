# Contributing to SAW Protocol

Thank you for your interest in contributing to **SAW Protocol** (Secure Atomic Wave Protocol)! 🌊⚛️  
Your contributions help make deterministic, secure, and transparent token launches accessible to everyone.

This guide outlines how to contribute effectively, maintain code quality, and ensure a smooth collaboration process.

## 📜 Code of Conduct

By participating in this project, you agree to abide by the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).  
Be respectful, inclusive, and constructive. Harassment, discrimination, or disruptive behavior will not be tolerated.

## 🛠️ How to Contribute

There are many ways to help:
- 🐛 **Report Bugs**: Open an issue with reproduction steps, environment details, and expected vs. actual behavior.
- 💡 **Suggest Features**: Use GitHub Discussions or open a feature request issue with clear use cases.
- 📖 **Improve Documentation**: Fix typos, clarify setup steps, add tutorials, or improve NatSpec comments.
- 💻 **Write Code**: Tackle `good first issue` or `help wanted` labels, or propose substantial improvements.

## 🚀 Development Setup

1. **Fork & Clone**
```bash
   git clone https://github.com/<your-username>/saw.git
   cd saw
```

2. **Install Dependencies**
```bash
   # Smart contracts (Foundry recommended)
   forge install

   # Backend & Frontend
   npm install
   # or yarn / pnpm
```

3. **Environment Variables**
   Copy `.env.example` to `.env` and configure:
```env
   PRIVATE_KEY=your_test_key
   RPC_URL=https://your-rpc-endpoint
   # Add other required vars
```

4. **Run Tests & Build**
```bash
   # Solidity
   forge build
   forge test

   # TypeScript/React
   npm run lint
   npm run test
   npm run build
```

## 📐 Coding Standards

### Solidity
- Follow the official [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use `// SPDX-License-Identifier: MIT` at the top of every `.sol` file
- Document all public/external functions with [NatSpec](https://docs.soliditylang.org/en/latest/natspec-format.html)
- Prefer `internal`/`private` visibility where possible
- Optimize for gas efficiency; document trade-offs in comments

### TypeScript & React
- Use ESLint + Prettier (config provided in repo)
- Strict TypeScript mode (`"strict": true`)
- Component-based architecture with clear prop typing
- Avoid inline styles; use CSS modules or Tailwind (as configured)

### Git & Commits
- Follow [Conventional Commits](https://www.conventionalcommits.org/)
