/** Compatibility entrypoint: never operate on a retired provider. */
console.error("The legacy bulk-deletion script is retired. Use am mux ls to inspect Workers, then am mux rm <name> for an explicitly selected Worker. No machines or local state were deleted.");
process.exitCode = 1;
export {};
