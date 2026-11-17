"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  Files,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { WorkspaceChallenge } from "@/lib/challenge-model";

type Directory = {
  path: string;
  name: string;
  folders: Map<string, Directory>;
  files: string[];
};
export function FileTree({
  challenge,
  files,
  selected,
  setSelected,
  dirty,
}: {
  challenge: Pick<WorkspaceChallenge, "id" | "repoName">;
  files: Record<string, string>;
  selected: string;
  setSelected: (path: string) => void;
  dirty: Set<string>;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [rootOpen, setRootOpen] = useState(true);
  const root = useMemo(() => {
    const tree: Directory = {
      path: "",
      name: "",
      folders: new Map(),
      files: [],
    };
    for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
      const parts = path.split("/");
      let parent = tree;
      for (const name of parts.slice(0, -1)) {
        const folderPath = parent.path ? `${parent.path}/${name}` : name;
        if (!parent.folders.has(name))
          parent.folders.set(name, {
            path: folderPath,
            name,
            folders: new Map(),
            files: [],
          });
        parent = parent.folders.get(name)!;
      }
      parent.files.push(path);
    }
    return tree;
  }, [files]);
  useEffect(() => {
    // External file navigation reveals its ancestors; collapsing a selected folder still works.
    const parts = selected.split("/");
    const parents = parts
      .slice(0, -1)
      .map((_, index) => parts.slice(0, index + 1).join("/"));
    setClosed((current) => {
      if (!parents.some((path) => current.has(path))) return current;
      const next = new Set(current);
      parents.forEach((path) => next.delete(path));
      return next;
    });
    setRootOpen(true);
  }, [selected]);
  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const groupId = (path: string) =>
    path
      ? `${challenge.id}-folder-${encodeURIComponent(path)}`
      : `${challenge.id}-repository-files`;
  const children = (directory: Directory, depth: number): React.ReactNode => (
    <>
      {[...directory.folders.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((folder) => {
          const open = !closed.has(folder.path);
          return (
            <li key={folder.path}>
              <button
                type="button"
                className="tree-row folder"
                title={folder.path}
                aria-expanded={open}
                aria-controls={groupId(folder.path)}
                style={{ paddingLeft: 12 + depth * 14 }}
                onClick={() => toggle(folder.path)}
              >
                {open ? <ChevronDown /> : <ChevronRight />}
                {open ? <FolderOpen /> : <Folder />}
                <span>{folder.name}</span>
              </button>
              <ul
                id={groupId(folder.path)}
                className="file-tree-list"
                hidden={!open}
              >
                {children(folder, depth + 1)}
              </ul>
            </li>
          );
        })}
      {directory.files.map((path) => (
        <li key={path}>
          <button
            type="button"
            title={path}
            aria-current={selected === path ? true : undefined}
            onClick={() => setSelected(path)}
            className={`tree-row file ${selected === path ? "selected" : ""}`}
            style={{ paddingLeft: 14 + depth * 14 }}
          >
            {path.endsWith(".json") ? <FileJson2 /> : <FileCode2 />}
            <span>{path.split("/").at(-1)}</span>
            {dirty.has(path) && <i />}
          </button>
        </li>
      ))}
    </>
  );
  return (
    <div className="file-panel">
      <div className="panel-title">
        <span>
          <Files />
          Explorer
        </span>
      </div>
      <div
        className="file-tree-scroll"
        role="region"
        aria-label={`${challenge.repoName} files`}
        tabIndex={0}
      >
        <button
          type="button"
          className="repo-title"
          title={challenge.repoName}
          aria-expanded={rootOpen}
          aria-controls={groupId("")}
          onClick={() => setRootOpen((open) => !open)}
        >
          {rootOpen ? <ChevronDown /> : <ChevronRight />}
          <b>{challenge.repoName.toUpperCase()}</b>
        </button>
        <ul id={groupId("")} className="file-tree-list" hidden={!rootOpen}>
          {children(root, 0)}
        </ul>
      </div>
    </div>
  );
}
