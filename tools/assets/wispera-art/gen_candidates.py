import os, sys, time, torch
os.environ["HF_HUB_OFFLINE"]="1"
from diffusers import AutoPipelineForText2Image
OUT=os.path.expanduser("~/claudetmp/wispera-redo/cand2")
os.makedirs(OUT,exist_ok=True)
LOG=open(os.path.expanduser("~/claudetmp/progress/hero-artist-wispera.log"),"a")
def log(s): LOG.write(s+"\n"); LOG.flush()
STYLE=", creature concept art, grimdark medieval fantasy painting, textured brushwork, luminous glow, isolated on plain flat pure black background, centered, single subject, no landscape, no ground, no text"
P={
"d":"a compact storm elemental spirit, a small dense dark thundercloud body with a bright blue-white glowing core in its chest, hollow glowing white eyes, jagged lightning arcing from it, ragged cloud tendrils trailing below like a ghost",
"e":"a sinister wisp of air, a glowing blue-white ball of light wreathed in swirling dark storm cloud and wind streaks, branching blue lightning crackling around it, ghostly cloud tail",
"f":"a spectral tempest wraith, a hooded ghost shaped of dark roiling storm clouds, two glowing white eyes, a radiant blue-white orb burning in its centre, electric forks around it, tattered tail",
}
NEG="cartoon, chibi, cute, anime, cel shading, vector art, flat colours, 3d render, plastic, toy, person, human, text, watermark, border, cropped, multiple subjects, landscape, sky, horizon, blurry"
pipe=AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo",torch_dtype=torch.float16,variant="fp16").to("mps")
for h,p in P.items():
    for i in range(1,9):
        t=time.time()
        im=pipe(p+STYLE,negative_prompt=NEG,num_inference_steps=4,guidance_scale=0.0,height=1024,width=1024,
            generator=torch.Generator("cpu").manual_seed(9100+i*31+ord(h)*3)).images[0]
        im.save(f"{OUT}/{h}_{i}.png"); log(f"{h} {i} {time.time()-t:.1f}s")
log("done")
