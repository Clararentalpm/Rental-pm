# Rental PM — Master Context

This document defines project boundaries for Cursor Agents working in this repository.

## Repository identity

- **This project:** Rental PM
- **This repository:** `Rental-pm` (`Clararentalpm/Rental-pm`)
- **Working app folder:** `Rental Management/`

## PROJECT ISOLATION RULE — RENTAL PM

This Agent is for **RENTAL PM ONLY**.

**Crystal Clear Optometry** is a completely separate project.

- Crystal Clear repository: `Crystal-Clear-Optometry`

### STRICT RULES

1. Never create, modify, copy, commit, merge or push Crystal Clear Optometry files or requirements into `Rental-pm`.

2. Never use Rental PM as a workspace, folder, branch or storage location for Crystal Clear Optometry.

3. If the user accidentally sends a Crystal Clear Optometry requirement in this Agent, **STOP** and tell them:

   > This belongs to Crystal-Clear-Optometry. Please switch to the Crystal Clear Optometry Agent.

4. Do not implement the Crystal Clear requirement.

5. Rental PM files, database, deployment and configuration must remain completely independent from Crystal Clear Optometry.

6. Before making future significant changes, verify that the current repository is `Rental-pm`.

## Related docs

- Product / feature requirements: `Rental Management/MASTER_REQUIREMENTS.md`
- Change history: `Rental Management/CHANGELOG.md`
