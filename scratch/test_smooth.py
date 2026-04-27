import pandas as pd

area_vals = pd.Series([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1])
lengths = pd.Series([10] * 15)
df_len = len(area_vals)

i = 0
while i < df_len:
    curr_val = area_vals.iloc[i]
    run_len = 0.0
    j = i
    while j < df_len and area_vals.iloc[j] == curr_val:
        run_len += lengths.iloc[j]
        j += 1
    
    if run_len < 100.0:
        prev_val = area_vals.iloc[i-1] if i > 0 else None
        next_val = area_vals.iloc[j] if j < df_len else None
        replace_val = curr_val
        if prev_val is not None:
            replace_val = prev_val
        elif next_val is not None:
            replace_val = next_val
            
        for k in range(i, j):
            area_vals.iloc[k] = replace_val
    i = j

print("Smoothed:")
print(area_vals.tolist())
