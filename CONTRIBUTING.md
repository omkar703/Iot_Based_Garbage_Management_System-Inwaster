# Contributing to InWaster

Thank you for your interest in contributing to the InWaster research project. We welcome academic contributions, algorithm improvements, firmware optimizations, and bug reports.

---

## Code of Academic Conduct
All contributors are expected to uphold standards of academic integrity, rigorous empirical validation, and reproducibility.

---

## Development & Contribution Workflow

### 1. Issue Discussion
Before undertaking significant architectural modifications or adding new modeling techniques:
1. Open an issue describing the proposed research methodology or software feature.
2. Outline the experimental hypotheses and evaluation metrics you plan to track.

### 2. Fork & Branching Strategy
- Fork the repository and create a feature branch off `main`:
  ```bash
  git checkout -b feature/model-lstm-forecasting
  ```
- Use lowercase, descriptive branch names (`fix/load-cell-tare`, `docs/sensor-specs`).

### 3. Code Standards & Linting
- **Python ML Pipeline (`scripts/`, `notebooks/`)**:
  - Follow PEP 8 guidelines.
  - Document all mathematical functions with docstrings and mathematical notation.
  - Seed all stochastic operations (`random_state=42`).
- **Full-Stack Next.js 14 (`src/`)**:
  - Strict TypeScript compliance (`npm run build`).
  - Follow Next.js App Router conventions.
  - Maintain the icon-free design standard on `/dashboard`.
- **ESP32 Firmware (`firmware/`)**:
  - Keep pin definitions and timing constants in `config.h`.
  - Verify FreeRTOS memory consumption and non-blocking state loops.

### 4. Verification Suite
Prior to submitting a pull request, execute the automated validation suite:
```bash
# Python backend & Next.js route tests
python test_nextjs.py

# Next.js static build check
npm run build
```

---

## License
By contributing to InWaster, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
