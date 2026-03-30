import csv
results = []
with open(r'C:\Users\Alaster\Documents\GitHub\PathSafetyAssessmentTool\backend\shapefiles\gradient_lookup.csv') as f:
    for row in csv.DictReader(f):
        pct = float(row['gradient_pct'])
        if abs(pct) > 5:
            results.append((pct, row['Image Reference']))
results.sort(key=lambda x: abs(x[0]), reverse=True)
for pct, img in results[:20]:
    print(f'{pct:+.2f}%  {img}')
print(f'\nTotal above 5%: {len(results)}')
