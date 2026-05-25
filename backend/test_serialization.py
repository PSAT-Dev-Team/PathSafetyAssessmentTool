import pandas as pd
import json

df = pd.DataFrame([{"score": 10, "Top Contributing Attributes": [{"name": "A", "contribution": 1.5}]}])
df.to_csv("test.csv", index=False)

df_read = pd.read_csv("test.csv")
records = df_read.to_dict(orient="records")

print("Type after reading:", type(records[0]["Top Contributing Attributes"]))
print("Value:", records[0]["Top Contributing Attributes"])
