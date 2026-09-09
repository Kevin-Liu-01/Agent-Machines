/** Compatibility entrypoint: never operate on a retired provider. */
console.error("The legacy provider-specific debug script is retired. Use am mux shell <name> or the dashboard terminal. No machine was contacted.");
process.exitCode = 1;
export {};
