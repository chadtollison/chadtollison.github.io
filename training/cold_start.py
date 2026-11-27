"""Time a cold start: import + load + first answer, in a fresh process.

  python training/cold_start.py scrubpii|presidio   -> prints JSON {"seconds": ...}
"""
import json
import sys
import time

t0 = time.time()
if sys.argv[1] == "scrubpii":
    import scrubpii
    scrubpii.find("Hi, I'm Sarah Johnson, call 415-555-0198.")
else:
    from presidio_analyzer import AnalyzerEngine
    AnalyzerEngine().analyze("Hi, I'm Sarah Johnson, call 415-555-0198.", language="en")
print(json.dumps({"seconds": round(time.time() - t0, 2)}))
