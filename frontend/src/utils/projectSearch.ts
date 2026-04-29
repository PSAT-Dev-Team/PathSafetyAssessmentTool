import type { ProjectListItem } from "../api";

function normalizeProjectSearchValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getProjectSearchFields(project: ProjectListItem): string[] {
  return [
    project.name,
    project.dataset || "",
    ...(project.tags || []),
    ...(project.source_folders || []),
  ];
}

export function matchesProjectSearch(project: ProjectListItem, query: string): boolean {
  const normalizedQuery = normalizeProjectSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return getProjectSearchFields(project).some((fieldValue) => {
    const normalizedField = normalizeProjectSearchValue(fieldValue || "");
    if (!normalizedField) {
      return false;
    }

    const compactField = normalizedField.replace(/\s+/g, "");
    return (
      normalizedField.includes(normalizedQuery) ||
      compactField.includes(compactQuery) ||
      queryTokens.every((token) => normalizedField.includes(token) || compactField.includes(token))
    );
  });
}