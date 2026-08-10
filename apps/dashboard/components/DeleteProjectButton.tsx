"use client";

export function DeleteProjectButton({
  action,
  projectName,
}: {
  action: () => Promise<never>;
  projectName: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
      >
        Delete project
      </button>
    </form>
  );
}
