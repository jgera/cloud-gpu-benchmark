# Methodology and Mathematical Formulation

## Purpose

The dashboard calculates estimated GPU-hours and compute cost for an equivalent amount of training work across cloud providers and local workstations. It is a procurement planning model, not a guarantee of model convergence or provider availability.

## Benchmark Profiles

| Profile | Measurement Workload | Primary Source |
| --- | --- | --- |
| Vision | Single-GPU YOLO26n training, COCO 640px, mixed precision, auto-batch; images/sec | [Ultralytics](https://www.ultralytics.com/benchmarks) |
| Transformer | DistilBERT BF16 sustained training throughput score | [LynxBenchAI 26Q3](https://www.technolynx.com/lynxbench-ai/training/) |
| Multimodal | Weighted harmonic blend of Vision and Transformer reference runtime share | Modeled scenario; not a single physical benchmark |

## Throughput Formulation & Reference Scaling

All hardware throughput is normalized to the **RTX 4090** ($s_{\text{4090}} = 1.00\times$):

$$s_g = \frac{\text{throughput}(g)}{\text{throughput}(\text{RTX 4090})}$$

### Configurable Reference GPU

When the user specifies that their training job takes $H_{\text{ref}}$ hours on a chosen reference GPU $g_{\text{ref}}$:

$$H_{4090} = H_{\text{ref}} \times s_{g_{\text{ref}}}$$

For legacy T4 reference mode where $s_{\text{T4}}$ is configured via the user-defined multiplier $M_{\text{T4}}$:

$$H_{4090} = \frac{H_{\text{T4}}}{M_{\text{T4}}}$$

### Multi-GPU Scaling Efficiency

When renting multi-GPU instances ($N$ GPUs), interconnect latency and all-reduce communication introduce a scaling penalty $\eta(N)$:
- $N = 1$: $\eta = 100\%$
- $N = 2$: $\eta = 92\%$
- $N = 4$: $\eta = 85\%$
- $N = 8$: $\eta = 78\%$

The effective speedup factor is:

$$S_{\text{effective}}(g, N) = s_g \times N \times \eta(N)$$

### Estimated Runtime and Billed Hours

$$\text{estimated\_hours} = \left(\frac{H_{4090}}{S_{\text{effective}}(g, N)}\right) \times \left(1 + \frac{\text{overhead}\%}{100}\right)$$

### Total Projected Cost

$$\text{compute\_cost} = \text{estimated\_hours} \times (\text{rate\_usd} \times N)$$
$$\text{storage\_cost} = \left(\text{storage\_gb} \times \frac{\$0.10}{730\text{ hours}}\right) \times \text{estimated\_hours}$$
$$\text{idle\_setup\_cost} = \text{idle\_hours} \times (\text{rate\_usd} \times N)$$
$$\text{total\_job\_cost} = \text{compute\_cost} + \text{storage\_cost} + \text{idle\_setup\_cost} + \text{fixed\_fee}$$

## Multimodal Harmonic Mean

For a scenario with Vision runtime fraction $w$ and Transformer runtime fraction $(1 - w)$:

$$s_{\text{multimodal}} = \frac{1}{\frac{w}{s_v} + \frac{1 - w}{s_t}}$$

This formulation preserves total physical work under a two-phase training regime. An arithmetic average of speeds would incorrectly assume equal work units rather than equal runtime share on the reference hardware.

## Pareto Frontier (Non-Dominated Solutions)

The scatter plot and comparison table identify non-dominated offers in two dimensions (completion hours and total job cost). An offer $A$ is Pareto optimal if no other offer $B$ exists such that:

$$H_B \le H_A \quad \text{and} \quad C_B \le C_A \quad \text{with at least one strict inequality.}$$

## Data Sources

- [Ultralytics GPU Training Throughput](https://www.ultralytics.com/benchmarks)
- [LynxBenchAI 26Q3 Benchmarks](https://www.technolynx.com/lynxbench-ai/training/)
- [RunPod Pricing](https://www.runpod.io/pricing)
- [Hyperstack GPU Pricing](https://www.hyperstack.cloud/gpu-pricing)
- [Thunder Compute Pricing](https://www.thundercompute.com/pricing)
- [Jarvislabs India Pricing](https://jarvislabs.ai/in)
- [Vast.ai Cloud Marketplace](https://cloud.vast.ai/)
- [Lambda Labs Cloud](https://lambdalabs.com/service/gpu-cloud)
