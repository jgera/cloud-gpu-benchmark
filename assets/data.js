/* Published snapshots, not live rates. See README.md and docs/methodology.md. */
window.GPU_DATA = Object.freeze({
  snapshot: '2026-11-02',
  fx: 94.70,
  sources: {
    ultralytics: 'https://www.ultralytics.com/benchmarks',
    lynxbench: 'https://www.technolynx.com/lynxbench-ai/training/',
    runpod: 'https://www.runpod.io/pricing',
    hyperstack: 'https://www.hyperstack.cloud/gpu-pricing',
    thunder: 'https://www.thundercompute.com/pricing',
    jarvis: 'https://jarvislabs.ai/in'
  },
  /* Training: vision=YOLO26n img/s, transformer=DistilBERT BF16 sustained score.
     mobileNet is used ONLY as a cross-model proxy when YOLO26n results are missing.
     A100 40 GB uses a configurable working assumption based on published multi-GPU results. */
  gpus: [
    {id:'t4', name:'NVIDIA T4',vram:16,vision:null,transformer:null,reference:true},
    {id:'rtx4080', name:'RTX 4080',vram:16,vision:null,mobileNet:226.33,transformer:305.83,local:true},
    {id:'rtx4080s',name:'RTX 4080 SUPER',vram:16,vision:null,mobileNet:215.50,transformer:322.97,local:true},
    {id:'rtx5080',name:'RTX 5080',vram:16,vision:null,mobileNet:229.48,transformer:372.87,local:true},
    {id:'rtx3090',name:'RTX 3090',vram:24,vision:184.8,transformer:null},
    {id:'rtx4090',name:'RTX 4090',vram:24,vision:306.0,mobileNet:268.26,transformer:472.39},
    {id:'rtx5090',name:'RTX 5090',vram:32,vision:356.0,transformer:736.92},
    {id:'a6000',name:'RTX A6000',vram:48,vision:209.9,transformer:null,transformerEstimate:0.72},
    {id:'l40s',name:'L40S',vram:48,vision:265.1,transformer:null,transformerEstimate:316.04/335.94},
    {id:'a100_40',name:'A100 40 GB',vram:40,vision:null,transformer:null,estimateFrom:'a100_80',estimateScale:0.955},
    {id:'a100_80',name:'A100 80 GB PCIe',vram:80,vision:283.2,transformer:639.53},
    {id:'a100_80s',name:'A100 80 GB SXM',vram:80,vision:286.8,transformer:690.91},
    {id:'h100s',name:'H100 SXM 80 GB',vram:80,vision:424.3,transformer:1291.98},
    {id:'h200',name:'H200 SXM 141 GB',vram:141,vision:490.6,transformer:null,transformerEstimate:2.30},
    {id:'pro6000',name:'RTX PRO 6000 Blackwell',vram:96,vision:420.6,transformer:null,transformerEstimate:1.55}
  ],
  /* Rate types: dedicated=on-demand, community=RunPod Community marketplace.
     Community prices are indicative advertised entry rates and can be unavailable. */
  offers: [
    {id:'rpc4090',gpu:'rtx4090',provider:'RunPod Community',tier:'community',rate:0.34,currency:'USD',source:'runpod',quality:'indicative'},
    {id:'rpcA6000',gpu:'a6000',provider:'RunPod Community',tier:'community',rate:0.33,currency:'USD',source:'runpod',quality:'indicative'},
    {id:'rpc5090',gpu:'rtx5090',provider:'RunPod Community',tier:'community',rate:0.69,currency:'USD',source:'runpod',quality:'indicative'},
    {id:'rpc3090',gpu:'rtx3090',provider:'RunPod Community',tier:'community',rate:0.22,currency:'USD',source:'runpod',quality:'indicative'},
    {id:'rpcA100',gpu:'a100_80',provider:'RunPod Community',tier:'community',rate:1.19,currency:'USD',source:'runpod',quality:'indicative'},
    {id:'rpcA100s',gpu:'a100_80s',provider:'RunPod Community',tier:'community',rate:1.39,currency:'USD',source:'runpod',quality:'indicative'},
    {id:'rps4090',gpu:'rtx4090',provider:'RunPod Secure',tier:'dedicated',rate:0.89,currency:'USD',source:'runpod'},
    {id:'rpsA6000',gpu:'a6000',provider:'RunPod Secure',tier:'dedicated',rate:0.59,currency:'USD',source:'runpod'},
    {id:'rps5090',gpu:'rtx5090',provider:'RunPod Secure',tier:'dedicated',rate:1.19,currency:'USD',source:'runpod'},
    {id:'rpsA100',gpu:'a100_80',provider:'RunPod Secure',tier:'dedicated',rate:1.79,currency:'USD',source:'runpod'},
    {id:'rpsA100s',gpu:'a100_80s',provider:'RunPod Secure',tier:'dedicated',rate:1.79,currency:'USD',source:'runpod'},
    {id:'rpsH100',gpu:'h100s',provider:'RunPod Secure',tier:'dedicated',rate:3.99,currency:'USD',source:'runpod'},
    {id:'hyA6000',gpu:'a6000',provider:'Hyperstack',tier:'dedicated',rate:0.50,currency:'USD',source:'hyperstack'},
    {id:'hyA100',gpu:'a100_80',provider:'Hyperstack',tier:'dedicated',rate:1.35,currency:'USD',source:'hyperstack'},
    {id:'hyA100s',gpu:'a100_80s',provider:'Hyperstack',tier:'dedicated',rate:1.60,currency:'USD',source:'hyperstack'},
    {id:'hyH100',gpu:'h100s',provider:'Hyperstack',tier:'dedicated',rate:3.20,currency:'USD',source:'hyperstack'},
    {id:'hyH200',gpu:'h200',provider:'Hyperstack',tier:'dedicated',rate:3.99,currency:'USD',source:'hyperstack'},
    {id:'hyPRO',gpu:'pro6000',provider:'Hyperstack',tier:'dedicated',rate:1.85,currency:'USD',source:'hyperstack'},
    {id:'thA6000',gpu:'a6000',provider:'Thunder Compute',tier:'dedicated',rate:0.35,currency:'USD',source:'thunder'},
    {id:'thA100',gpu:'a100_80',provider:'Thunder Compute',tier:'dedicated',rate:1.09,currency:'USD',source:'thunder'},
    {id:'thH100',gpu:'h100s',provider:'Thunder Compute',tier:'dedicated',rate:3.20,currency:'USD',source:'thunder'},
    {id:'jaA10040',gpu:'a100_40',provider:'Jarvislabs',tier:'dedicated',rate:84.24,currency:'INR',source:'jarvis'},
    {id:'jaA10080',gpu:'a100_80',provider:'Jarvislabs',tier:'dedicated',rate:140.94,currency:'INR',source:'jarvis'},
    {id:'jaH100',gpu:'h100s',provider:'Jarvislabs',tier:'dedicated',rate:330.48,currency:'INR',source:'jarvis'},
    {id:'jaPRO',gpu:'pro6000',provider:'Jarvislabs',tier:'dedicated',rate:207.36,currency:'INR',source:'jarvis'}
  ]
});
