import os, time, torch
os.environ["HF_HUB_OFFLINE"]="1"
from diffusers import AutoPipelineForImage2Image
from PIL import Image
D=os.environ.get("WISPERA_ART_DIR", ".scratch/wispera-art")  # work dir: cand2/ (text2img), ref/ (img2img)
os.makedirs(f"{D}/ref",exist_ok=True)
LOG=open(os.environ["WISPERA_LOG"],"a") if os.environ.get("WISPERA_LOG") else open(os.devnull,"w")  # optional progress log
P=("a radiant blue-white glowing glass orb of light at the centre, surrounded by thick dark churning thunderclouds, "
   "sharp jagged forked lightning bolts radiating outward like a starburst, grimdark medieval fantasy painting, textured brushwork, "
   "luminous glow, plain flat pure black background, centered, single subject, no tree, no roots, no branches, no text")
NEG="tree, roots, branches, twigs, veins, cartoon, chibi, anime, vector, flat colours, 3d render, text, watermark, landscape, ground, multiple subjects, blurry"
pipe=AutoPipelineForImage2Image.from_pretrained("stabilityai/sdxl-turbo",torch_dtype=torch.float16,variant="fp16").to("mps")
src=Image.open(f"{D}/cand2/e_8.png").convert("RGB")
for st in (0.45,0.6,0.75):
    for i in range(1,5):
        t=time.time()
        im=pipe(P,negative_prompt=NEG,image=src,strength=st,num_inference_steps=5,guidance_scale=0.0,
                generator=torch.Generator("cpu").manual_seed(4400+i*17+int(st*100))).images[0]
        im.save(f"{D}/ref/r{int(st*100)}_{i}.png"); LOG.write(f"ref {st} {i} {time.time()-t:.1f}s\n"); LOG.flush()
LOG.write("ref done\n"); LOG.flush()
