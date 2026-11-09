"use client";

import {
  createContext,
  startTransition,
  use,
  useCallback,
  useMemo,
  useOptimistic,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import * as actions from "@/actions";
import { clientId } from "@/lib/client";
import type {
  ActionResult,
  ItemLite,
  Member,
  Priority,
  ProjectFull,
  Recurrence,
  StatusCategory,
  StatusLite,
} from "@/lib/types";

type Data = { items: ItemLite[]; statuses: StatusLite[] };

type Op =
  | { type: "item.add"; item: ItemLite }
  | { type: "item.patch"; id: string; patch: Partial<ItemLite> }
  | { type: "item.remove"; id: string }
  | { type: "status.add"; status: StatusLite }
  | { type: "status.patch"; id: string; patch: Partial<StatusLite> }
  | { type: "status.remove"; id: string; moveToId: string }
  | { type: "status.reorder"; ids: string[] };

function reduce(data: Data, op: Op): Data {
  switch (op.type) {
    case "item.add":
      return { ...data, items: [...data.items, op.item] };
    case "item.patch":
      return {
        ...data,
        items: data.items.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i)),
      };
    case "item.remove":
      return { ...data, items: data.items.filter((i) => i.id !== op.id) };
    case "status.add":
      return { ...data, statuses: [...data.statuses, op.status] };
    case "status.patch":
      return {
        ...data,
        statuses: data.statuses.map((s) => (s.id === op.id ? { ...s, ...op.patch } : s)),
      };
    case "status.remove":
      return {
        statuses: data.statuses.filter((s) => s.id !== op.id),
        items: data.items.map((i) =>
          i.statusId === op.id ? { ...i, statusId: op.moveToId } : i,
        ),
      };
    case "status.reorder":
      return {
        ...data,
        statuses: op.ids
          .map((id, index) => {
            const found = data.statuses.find((s) => s.id === id);
            return found ? { ...found, position: index } : null;
          })
          .filter((s): s is StatusLite => s !== null),
      };
  }
}

export type ItemChanges = {
  title?: string;
  description?: string;
  statusId?: string;
  priority?: Priority;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  position?: number;
};

export type NewItemInput = {
  title: string;
  statusId?: string;
  dueDate?: string | null;
};

type Store = {
  project: ProjectFull;
  members: Member[];
  userId: string;
  today: string;
  items: ItemLite[];
  statuses: StatusLite[];
  /** Bumped after every saved change, so open panels know to reload. */
  version: number;
  addItem: (input: NewItemInput) => string;
  changeItem: (id: string, changes: ItemChanges) => void;
  removeItem: (id: string) => void;
  addStatus: (name: string) => void;
  changeStatus: (id: string, patch: { name?: string; color?: string; category?: StatusCategory }) => void;
  removeStatus: (id: string) => void;
  moveStatus: (id: string, direction: -1 | 1) => void;
  /** Runs a server action that isn't modeled above, then refreshes panels. */
  run: <T>(work: () => Promise<ActionResult<T>>) => Promise<ActionResult<T>>;
};

const StoreContext = createContext<Store | null>(null);

export function useProject(): Store {
  const store = use(StoreContext);
  if (!store) throw new Error("useProject must be used inside a ProjectStore");
  return store;
}

const STATUS_COLORS = ["blue", "violet", "orange", "teal", "pink", "indigo", "amber", "red"];

export function ProjectStore({
  project,
  statuses,
  items,
  members,
  userId,
  today,
  children,
}: {
  project: ProjectFull;
  statuses: StatusLite[];
  items: ItemLite[];
  members: Member[];
  userId: string;
  today: string;
  children: ReactNode;
}) {
  const base = useMemo(() => ({ items, statuses }), [items, statuses]);
  const [data, apply] = useOptimistic(base, reduce);
  const [version, setVersion] = useState(0);

  const commit = useCallback(
    <T,>(op: Op | null, work: () => Promise<ActionResult<T>>, onDone?: (result: T) => void) => {
      startTransition(async () => {
        if (op) apply(op);
        const result = await work();
        if (!result.ok) {
          toast.error(result.error);
        } else if (onDone) {
          onDone(result as T);
        }
        setVersion((v) => v + 1);
      });
    },
    [apply],
  );

  const store = useMemo<Store>(() => {
    const sorted = [...data.statuses].sort((a, b) => a.position - b.position);
    const statusById = new Map(sorted.map((s) => [s.id, s]));

    return {
      project,
      members,
      userId,
      today,
      items: data.items,
      statuses: sorted,
      version,

      addItem(input) {
        const id = clientId();
        const status =
          statusById.get(input.statusId ?? "") ??
          sorted.find((s) => s.category === "todo") ??
          sorted[0];
        const last = data.items
          .filter((i) => i.statusId === status.id)
          .reduce((max, i) => Math.max(max, i.position), 0);
        const item: ItemLite = {
          id,
          projectId: project.id,
          workspaceId: project.workspaceId,
          number: 0,
          title: input.title,
          statusId: status.id,
          priority: "none",
          assigneeId: null,
          startDate: null,
          dueDate: input.dueDate ?? null,
          position: last + 1,
          parentId: null,
          recurrence: null,
          source: "manual",
          completedAt: status.category === "done" ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
          commentCount: 0,
          subtaskTotal: 0,
          subtaskDone: 0,
        };
        commit({ type: "item.add", item }, () =>
          actions.createItem({
            id,
            projectId: project.id,
            title: input.title,
            statusId: status.id,
            dueDate: input.dueDate ?? null,
          }),
        );
        return id;
      },

      changeItem(id, changes) {
        const current = data.items.find((i) => i.id === id);
        const { description, ...visible } = changes;
        void description;
        const patch: Partial<ItemLite> = { ...visible };
        if (changes.statusId && current && changes.statusId !== current.statusId) {
          const to = statusById.get(changes.statusId);
          if (to?.category === "done") {
            patch.completedAt = current.completedAt ?? new Date().toISOString();
          } else {
            patch.completedAt = null;
          }
        }
        commit(
          current ? { type: "item.patch", id, patch } : null,
          () => actions.updateItem({ itemId: id, patch: changes, today }),
          (result: { spawnedId: string | null }) => {
            if (result.spawnedId) {
              toast.success("Done. The next one is already on the board.");
            }
          },
        );
      },

      removeItem(id) {
        commit({ type: "item.remove", id }, () => actions.deleteItem({ itemId: id }));
      },

      addStatus(name) {
        const id = clientId();
        const used = sorted.map((s) => s.color);
        const color = STATUS_COLORS.find((c) => !used.includes(c)) ?? "blue";
        const status: StatusLite = {
          id,
          projectId: project.id,
          name,
          color,
          category: "active",
          position: sorted.length,
        };
        commit({ type: "status.add", status }, () =>
          actions.createStatus({ id, projectId: project.id, name, color, category: "active" }),
        );
      },

      changeStatus(id, patch) {
        commit({ type: "status.patch", id, patch }, () =>
          actions.updateStatus({ statusId: id, ...patch }),
        );
      },

      removeStatus(id) {
        const others = sorted.filter((s) => s.id !== id);
        if (others.length === 0) {
          toast.error("A project needs at least one status.");
          return;
        }
        const moveToId = others[0].id;
        commit({ type: "status.remove", id, moveToId }, () =>
          actions.deleteStatus({ statusId: id, moveToId }),
        );
      },

      moveStatus(id, direction) {
        const ids = sorted.map((s) => s.id);
        const index = ids.indexOf(id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        commit({ type: "status.reorder", ids }, () =>
          actions.reorderStatuses({ projectId: project.id, ids }),
        );
      },

      run(work) {
        return new Promise((resolve) => {
          startTransition(async () => {
            const result = await work();
            if (!result.ok) toast.error(result.error);
            setVersion((v) => v + 1);
            resolve(result);
          });
        });
      },
    };
  }, [data, project, members, userId, today, version, commit]);

  return <StoreContext value={store}>{children}</StoreContext>;
}
