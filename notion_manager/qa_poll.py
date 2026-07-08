#!/usr/bin/env python3
# Q&A 폴링 헬퍼 (MCP 우회). 반드시 이 디렉토리에서 실행(/tmp/types.py 셰도잉 회피).
import json,urllib.request,os,re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
cfg=json.load(open("config.json")); key=cfg["api_key"]
pid="384111a57788819c9379fe0b0a21e35b"
def api(u):
    r=urllib.request.Request(u,headers={"Authorization":f"Bearer {key}","Notion-Version":"2022-06-28"})
    return json.load(urllib.request.urlopen(r,timeout=30))
blocks=[];cur=None
while True:
    u=f"https://api.notion.com/v1/blocks/{pid}/children?page_size=100"+(f"&start_cursor={cur}" if cur else "")
    d=api(u);blocks+=d["results"]
    if not d.get("has_more"):break
    cur=d["next_cursor"]
def txt(b):
    t=b.get(b["type"],{}); rt=t.get("rich_text",[]) if isinstance(t,dict) else []
    return "".join(x.get("plain_text","") for x in rt)
lines=[txt(b) for b in blocks]
full="\n".join(lines)
qs=re.findall(r"Q(\d+)\.",full)
lastq=max(int(x) for x in qs) if qs else 0
_decl=[l for l in lines if ("임무 완료" in l) and ("보이면" not in l) and ("마커 보이면" not in l)]
done = len(_decl)>0  # 안내문 제외한 실제 완료선언만
print(f"blocks={len(blocks)} lastQ=Q{lastq} done={done}")
# 마지막 Q블록 위치부터 끝까지 출력
idx=None
for i,l in enumerate(lines):
    if re.match(rf"^Q{lastq}\.",l.strip()): idx=i
if idx is not None:
    print("=== 마지막 Q부터 ===")
    for l in lines[idx:idx+15]:
        if l.strip(): print(l[:300])
