# Live World Model Lab

An interactive UTMIST workshop demo that runs a real compact world model entirely in the browser.

The experiment trains five neural transition predictors from random initialization, uses their action-conditioned rollouts for model-predictive control, introduces a previously unseen dynamics change, measures the resulting prediction error, applies a fast residual update, and replans around the changed transition.

## What is—and is not—being claimed

- Real: learned weights, held-out loss, ensemble predictions, uncertainty, rollout search, environment transitions, online adaptation, and replanning.
- Simplified: observations are compact occupancy grids and the predictors are small MLPs. This is not a pretrained video world foundation model.

That compact scope makes the complete causal loop visible, reproducible, and reliable during a workshop. The closing section identifies how to scale the same protocol to JEPA-WM, DINO-WM, or action-conditioned video diffusion.

## Run

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and follow the single experiment button.

## Validate

```bash
npm test
```

The numerical tests verify that the ensemble learns nominal dynamics, that MPC reaches the goal through the initially valid shortcut, and that a one-shot dynamics update causes replanning around the changed edge.
