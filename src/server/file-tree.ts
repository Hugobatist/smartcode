/**
 * A node in the file tree returned by /tree.json.
 */
export interface TreeNode {
  type: 'file' | 'folder';
  name: string;
  path?: string;
  children?: TreeNode[];
}

/**
 * Convert a flat list of relative file paths into a nested tree structure.
 * Used by /tree.json to match the format expected by live.html sidebar.
 */
export function buildFileTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.push({ type: 'file', name: part, path: filePath });
      } else {
        let folder = current.find(
          (n) => n.type === 'folder' && n.name === part,
        );
        if (!folder) {
          folder = { type: 'folder', name: part, children: [] };
          current.push(folder);
        }
        current = folder.children!;
      }
    }
  }

  return root;
}
