export const env = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === "then") return undefined;
      return "";
    },
  },
);
