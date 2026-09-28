#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
视频逐帧拆解工具：抽帧 + 信息探测
用法:
    python extract_frames.py <视频路径> <输出目录>
输出:
    - probe.txt: 视频基本信息(时长/分辨率/帧率)
    - frames_all/   : 开头6秒逐帧(fps与源一致, 或自动上限)
    - frames_1s/    : 全片每秒1帧概览
"""
import sys, os, subprocess, json, math

def get_ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout, r.stderr

def probe(video, ff):
    out, err = run([ff, "-i", video])
    # 时长解析: Duration: 00:01:05.32
    info = {}
    for line in err.splitlines():
        if "Duration:" in line:
            d = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = d.split(":")
            info["duration"] = round(int(h)*3600 + int(m)*60 + float(s), 2)
        if "Video:" in line and "fps" in line:
            for part in line.split(","):
                part = part.strip()
                if "fps" in part:
                    info["fps"] = float(part.replace("fps", "").strip())
                if "x" in part and any(c.isdigit() for c in part):
                    info["resolution"] = part.strip()
    return info

def main():
    video = sys.argv[1]
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    ff = get_ffmpeg()

    info = probe(video, ff)
    with open(os.path.join(outdir, "probe.txt"), "w") as f:
        f.write(json.dumps(info, ensure_ascii=False, indent=2))
    print("PROBE:", json.dumps(info, ensure_ascii=False))

    dur = info.get("duration", 0)
    fps = info.get("fps", 30)

    # 1) 全片每秒1帧概览
    d1 = os.path.join(outdir, "frames_1s")
    os.makedirs(d1, exist_ok=True)
    run([ff, "-y", "-i", video, "-vf", "fps=1,scale=270:-2", "-q:v", "3",
         os.path.join(d1, "s%03d.jpg")])

    # 2) 开头6秒 高频抽帧 (fps上限6, 避免太多)
    cap = min(fps, 6)
    d2 = os.path.join(outdir, "opening_6s")
    os.makedirs(d2, exist_ok=True)
    run([ff, "-y", "-ss", "0", "-i", video, "-t", "6",
         "-vf", f"fps={cap},scale=540:-2", "-q:v", "2",
         os.path.join(d2, "o%02d.jpg")])

    print("DONE. frames_1s:", len(os.listdir(d1)), "opening_6s:", len(os.listdir(d2)))

if __name__ == "__main__":
    main()
