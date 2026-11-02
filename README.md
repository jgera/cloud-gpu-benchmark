# GPU Cost Explorer

A static dashboard for comparing GPU rental prices, training performance, memory capacity, and estimated cost per completed job. It works in a modern browser without a backend, account, build tool, or third-party JavaScript dependencies.

**[Open the dashboard](index.html)** | [Methodology](docs/methodology.md) | [Free-credit research](docs/credits.md)

![Dashboard screenshot](assets/dashboard-preview.png)

## Features

- **Multi-Provider Comparison:** Compare RunPod (Community & Secure), Hyperstack, Thunder Compute, Jarvislabs, Vast.ai, and Lambda Labs.
- **Configurable Runtime Reference:** Choose any reference GPU where you know or estimate baseline runtime: **RTX 4090**, **A100 80 GB (PCIe / SXM)**, **A100 40 GB**, **H100 SXM**, **RTX 3090**, **RTX A6000**, or **T4**.
- **Multi-GPU Scaling:** Simulate distributed instance clusters (1×, 2×, 4×, 8× GPUs) with configurable interconnect scaling efficiency.
- **Model Memory Presets:** Quick-select VRAM feasibility presets for popular AI models (LLaMA 3 8B / 70B, SDXL, Flux.1, DeepSeek MoE).
- **Workload Profiles:** Select **Vision** (Ultralytics YOLO26n), **Transformer** (LynxBenchAI DistilBERT BF16), or **Multimodal** (harmonic blend).
- **Interactive Visualizations:**
  - **Scatter Plot with Pareto Frontier:** Toggle between **Linear** and **Logarithmic** scales; hover over points for instant rich tooltips showing speeds, rates, and frontier efficiency.
  - **Bar Chart Rankings:** Rank top offers by Lowest Total Cost, Fastest Completion, Lowest Hourly Rate, or Value Score (Throughput / $).
- **Side-by-Side Comparison:** Check boxes on rental offers to compare cost deltas, runtime differences, and specs side by side.
- **Local Workstation Buy vs. Rent:** Real-time break-even analysis for desktop hardware (RTX 4070 Ti, 4080, 5080, 5090) calculating how many training jobs pay off retail purchase prices against cloud rentals.
- **Storage, Idle & Overhead Accounting:** Factor in persistent network storage ($/GB/month), environment setup/idle hours, and failure margin overhead.
- **Shareable State & Exports:** Instant URL link sharing with full filter state preservation; 1-click CSV and JSON data export directly from the header.
- **Currency & Theme:** **USD ($) is the default**, with optional INR (₹) live conversion. Toggle between Light and Dark modes.

The dashboard uses a **fixed 2 November 2026 data snapshot**. It does not retrieve live availability or real-time pricing feeds.

## Selected Hardware

| GPU | VRAM | Main role in this comparison |
| --- | ---: | --- |
| RTX 4070 Ti SUPER / 4080 / 4080 SUPER | 16 GB | Local workstation candidates; optional user-entered rental prices |
| RTX 5080 | 16 GB | Newer local workstation candidate with break-even analysis |
| RTX 4090 | 24 GB | Standard baseline (1.00×) and cost-focused cloud rental |
| NVIDIA L4 | 24 GB | Power-efficient 24 GB cloud inference & training candidate |
| RTX 5090 | 32 GB | Next-generation consumer desktop/workstation flagship |
| A100 40 GB | 40 GB | Lower-cost enterprise A100 option where 40 GB fits the model |
| RTX A6000 / L40S | 48 GB | Professional high-memory cloud candidates |
| A100 80 GB PCIe / SXM | 80 GB | Large-memory enterprise standard |
| H100 SXM 80 GB | 80 GB | High-throughput enterprise reference |
| H200 SXM | 141 GB | Ultra-large memory SXM accelerator |
| AMD Instinct MI300X | 192 GB | High-capacity alternative with 192 GB HBM3 memory |
| RTX PRO 6000 Blackwell | 96 GB | Professional workstation / cloud reference |

## Rental Rates Snapshot (Sample)

| Provider and tier | RTX 4090 24 GB | RTX A6000 48 GB | A100 40 GB | A100 80 GB | H100 SXM | Source |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Vast.ai Community | $0.32 | $0.38 | Not listed | $1.15 | Not listed | [Vast.ai](https://cloud.vast.ai/) |
| RunPod Community | $0.34 | $0.33 | Not listed | $1.19 | Not listed | [RunPod](https://www.runpod.io/pricing) |
| Thunder Compute | Not listed | $0.35 | Not listed | $1.09 | $3.20 | [Thunder Compute](https://www.thundercompute.com/pricing) |
| Hyperstack on-demand | Not listed | $0.50 | Not listed | $1.35 | $3.20 | [Hyperstack](https://www.hyperstack.cloud/gpu-pricing) |
| RunPod Secure | $0.89 | $0.59 | Not listed | $1.79 | $3.99 | [RunPod](https://www.runpod.io/pricing) |
| Lambda Labs on-demand | Not listed | $0.80 | Not listed | $1.89 | $2.49 | [Lambda Labs](https://lambdalabs.com/service/gpu-cloud) |
| Jarvislabs on-demand | Not listed | Not listed | ₹84.24 (~$0.89) | ₹140.94 (~$1.49) | ₹330.48 (~$3.49) | [Jarvislabs India](https://jarvislabs.ai/in) |

The complete editable dataset is located in [`assets/data.js`](assets/data.js).

## Calculation Methodology

The relative performance baseline is calibrated against the **RTX 4090** ($1.00\times$):

```text
ref_ratio = throughput(reference_gpu) / throughput(RTX 4090)
workload_hours_on_4090 = reference_hours * ref_ratio

effective_speed = (throughput(target_gpu) / throughput(RTX 4090)) * gpu_count * cluster_efficiency
estimated_gpu_hours = (workload_hours_on_4090 / effective_speed) * (1 + overhead_percent / 100)

hourly_compute = hourly_rate_per_gpu * gpu_count
total_cost = (estimated_gpu_hours * hourly_compute) + fixed_fees + storage_amortized + (idle_hours * hourly_compute)
```

See [docs/methodology.md](docs/methodology.md) for full mathematical definitions and source citations.

## Running Locally

Open [`index.html`](index.html) in any modern browser. No build steps, bundlers, or packages are needed.

For a local static server:

```bash
python -m http.server 8000
```
Then visit `http://localhost:8000`.

## Testing

Run the automated test suite with Node.js:

```bash
node tests/check-data.cjs
```
