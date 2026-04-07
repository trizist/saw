## 📋 Description

<!-- Provide a clear description of your changes -->
<!-- Include motivation, context, and related issues -->

Closes #

## 🎯 Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📖 Documentation update
- [ ] 🧪 Test addition/update
- [ ] ⚡ Performance optimization
- [ ] 🔐 Security fix
- [ ] 🔄 Refactoring (no functional changes)

## ✅ Security Checklist

**All PRs must address security considerations:**

- [ ] **Smart Contracts**
  - [ ] No reentrancy vulnerabilities introduced
  - [ ] Access controls properly implemented
  - [ ] Integer overflow/underflow protected (Solidity 0.8+)
  - [ ] Gas limits respected (no unbounded loops)
  - [ ] Entropy sources validated
  - [ ] Commit-reveal mechanism intact
  - [ ] Time-lock constraints maintained

- [ ] **Backend/API**
  - [ ] Input validation on all endpoints
  - [ ] Authentication/authorization verified
  - [ ] Rate limiting implemented (if applicable)
  - [ ] No secrets logged or exposed
  - [ ] SQL/NoSQL injection prevented

- [ ] **Frontend**
  - [ ] XSS prevention measures
  - [ ] CSRF protection (if applicable)
  - [ ] Wallet connection security verified
  - [ ] No sensitive data in client-side code

- [ ] **Dependencies**
  - [ ] `npm audit` passes with no high/critical issues
  - [ ] `forge snapshot` shows acceptable gas changes
  - [ ] All dependencies up-to-date or justified

## 🧪 Testing

- [ ] Tests added/updated for new functionality
- [ ] All existing tests pass
- [ ] Edge cases covered
- [ ] Gas optimization tests (if applicable)

**Test Commands:**
```bash
# Run all tests
forge test
npm run test

# Check coverage
forge coverage
npm run test:coverage

# Lint check
npm run lint
```

## 📊 Test Coverage

<!-- Paste coverage summary here -->
