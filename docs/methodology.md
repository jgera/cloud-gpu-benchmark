# Methodology and limitations

## Purpose

The dashboard estimates GPU-hours and rental cost for an equivalent amount of training work. It is a planning tool, not a claim about model quality, training convergence, or provider uptime.

## Benchmark definitions

| Profile | Measurement | Primary source |
| --- | --- | --- |
| Vision | Single-GPU YOLO26n training, COCO at 640px, mixed precision, auto-batch; images/sec | [Ultralytics](https://www.ultralytics.com/benchmarks) |
| Transformer | DistilBERT BF16 sustained training results | [LynxBenchAI 26Q3](https://www.technolynx.com/lynxbench-ai/training/) |
| Multimodal | Mathematical composition of Vision and Transformer runtimes | Modeled scenario; not a measured benchmark |

**Vision limitations:** Ultralytics auto-selects batch sizes per GPU. Its YOLO26n workload can strongly favor different cards from a large ViT, diffusion, or segmentation model. The dashboard does not label YOLO26n throughput as a ViT benchmark.

**Transformer limitations:** DistilBERT is much smaller than modern large Transformer models. It is useful for relative throughput on a common test, but a model requiring tens of gigabytes of activation memory may behave differently.

## Missing benchmark values

There are no fabricated measured records:

- For RTX 4080 / RTX 4080 SUPER / RTX 5080 in the Vision profile, the matched **MobileNetV3 BF16** result is used to compute a *cross-model proxy ratio* against the RTX 4090's MobileNetV3 result. This does not produce a YOLO26n images/sec figure.
- For A100 40 GB, a provisional `0.955 × A100 80 GB` throughput proxy is used. The supporting DFKI source measures **eight-GPU nodes**, with 326,000 and 341,000 TF32 tokens/sec at a common batch setting. A single-GPU ratio was not directly measured.
- For A6000 Transformer, the initial fallback is `0.72 × RTX 4090` and is labeled as an **assumption**, not benchmark-derived evidence. This ratio should be replaced if a matched dataset becomes available.
- For other GPUs lacking a matched result, fallbacks use a cross-model ratio or stated working assumption, always labeled *estimated*.
- Multimodal results are labeled *estimated* even when both source components are measured, because the composition is itself a model rather than a real run.

## Multimodal formula

Let `s_v` and `s_t` be the Vision and Transformer throughput ratios relative to RTX 4090, and `w` the share of reference runtime attributed to Vision.

```text
multimodal_ratio = 1 / (w / s_v + (1 - w) / s_t)
```

This preserves total work under a two-phase training assumption. An arithmetic mean of speeds would incorrectly assume equal work fractions, not equal runtime fractions on the reference GPU.

## Time and cost

For an RTX 4090 reference workload with elapsed time `T`:

```text
estimated_hours = T / relative_throughput
billable_hours = estimated_hours * (1 + overhead_percent / 100)
compute_cost_usd = billable_hours * rate_usd_per_hour
job_cost_usd = compute_cost_usd + fixed_cost_usd
```

If the reference is the T4, the dashboard first calculates `T / assumed_4090_over_T4_factor`. The default 6× is illustrative and is not derived from the two published benchmark suites. Keep the factor editable until you collect a matched T4 throughput measurement.

### What the model does not include automatically

- CPU performance, host RAM, I/O throughput, data loading, and dataset preprocessing.
- VM boot times, checkpoint upload/download time, and configuration errors.
- Provider storage charges, egress, tax, currency-card markup, reserved pricing, and committed-use discounts.
- Availability, spot interruptions, session limits, actual price at checkout, or minimum billing increments.
- Effects of gradient checkpointing, mixed-precision implementation, tensor layouts, memory offloading, or multi-GPU scaling.
- Variation in optimization target, convergence, and final model quality.

Set an extra-time percentage and an additional fixed USD charge when those are known. Report prices as static reference snapshots, not as live quotes.

## Cost and memory feasibility

The memory filter removes GPUs with insufficient *listed capacity*, but a model's peak allocated memory must be measured separately. GPU VRAM is not additive across multiple cards unless the training code uses suitable model parallelism or distributed algorithms. Keep headroom for runtime state, dataset-specific tensors, validation, and larger examples.

The cost-time chart highlights **Pareto non-dominated offers** in two dimensions: estimated completion hours and estimated total cost. A point is dominated if another priced offer is no slower and no more expensive, and strictly better in at least one. It does not account for downtime, SLA, or region.

## Source pages

- [Ultralytics, GPU Training Throughput](https://www.ultralytics.com/benchmarks)
- [LynxBenchAI 26Q3](https://www.technolynx.com/lynxbench-ai/training/)
- [DFKI Pegasus, node-level GPU benchmarks](https://pegasus.dfki.de/docs/slurm-cluster/partitions/)
- [RunPod pricing](https://www.runpod.io/pricing)
- [Hyperstack GPU pricing](https://www.hyperstack.cloud/gpu-pricing)
- [Thunder Compute pricing](https://www.thundercompute.com/pricing)
- [Jarvislabs India GPU pricing](https://jarvislabs.ai/in)

Source values and prices were reviewed for this snapshot on **2 November 2026**. None are guaranteed to remain unchanged.
