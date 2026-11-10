const LEITURA = /^(select|with|explain|pragma)\b/i;
const protegidos = new WeakSet<object>();

export function sqlGeoSomenteLeitura(sql: string) {
  const partes = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((parte) => parte.trim())
    .filter(Boolean);
  return (
    partes.length > 0 &&
    partes.every((parte) => LEITURA.test(parte) && !/^pragma\b[^=]*=/i.test(parte))
  );
}

export function geoDbSomenteLeitura(db: D1Database): D1Database {
  if (protegidos.has(db)) return db;
  const preparar = (sql: string) => {
    if (!sqlGeoSomenteLeitura(sql)) throw new Error('GEO_DB é somente leitura.');
    return db.prepare(sql);
  };
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') return preparar;
      if (prop === 'exec') {
        return (sql: string) => {
          if (!sqlGeoSomenteLeitura(sql)) throw new Error('GEO_DB é somente leitura.');
          return target.exec(sql);
        };
      }
      if (prop === 'withSession') {
        return (...args: unknown[]) =>
          geoDbSomenteLeitura(
            (target.withSession as (...values: unknown[]) => unknown)(...args) as D1Database
          );
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  protegidos.add(proxy);
  return proxy;
}
