import { ACTION_SCHEMA } from "./src/lib/copilot/actions";

type RoutedAction = {
  action: string;
  arguments: Record<string, unknown>;
};

function routeLocal(text: string): RoutedAction | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const providerSearchMatch = normalized.match(
    /(?:busca|buscar|encuentra|encontrar)\s+(?:el\s+)?(?:proveedor\s+)?(.+)/
  );

  if (
    normalized.includes("proveedor") ||
    normalized.includes("proveedores") ||
    providerSearchMatch
  ) {
    if (providerSearchMatch?.[1]) {
      return {
        action: "gestionar_proveedores",
        arguments: {
          p_accion: "buscar",
          p_datos: {
            nombre: providerSearchMatch[1].trim(),
          },
        },
      };
    }

    return {
      action: "gestionar_proveedores",
      arguments: {
        p_accion: "listar",
      },
    };
  }

  if (
    normalized.includes("receta") ||
    normalized.includes("recetas")
  ) {
    return {
      action: "gestionar_recetas",
      arguments: {
        p_accion: "listar",
      },
    };
  }

  if (
    normalized.includes("ingrediente") ||
    normalized.includes("ingredientes")
  ) {
    return {
      action: "gestionar_ingredientes",
      arguments: {
        p_accion: "listar",
      },
    };
  }

  if (
    normalized.includes("stock") ||
    normalized.includes("inventario")
  ) {
    return {
      action: "consultar_inventario",
      arguments: {},
    };
  }

  if (
    normalized.includes("empleado") ||
    normalized.includes("empleados") ||
    normalized.includes("usuario") ||
    normalized.includes("usuarios")
  ) {
    return {
      action: "consultar_usuarios",
      arguments: {},
    };
  }

  return null;
}

const tests = [
  "¿Qué proveedores tenemos registrados?",
  "Enséñame los proveedores",
  "Lista de proveedores",
  "Busca Ametller",
  "Buscar proveedor Carnicas Pijuan",
  "¿Qué recetas tenemos?",
  "¿Qué ingredientes tenemos?",
  "¿Cuánto stock tenemos?",
  "Muéstrame los empleados",
  "¿Cuánto hemos vendido esta semana?",
];

for (const prompt of tests) {
  const route = routeLocal(prompt);

  console.log("\nPROMPT:", prompt);
  console.log("ROUTE:", JSON.stringify(route, null, 2));

  if (route) {
    const definition =
      ACTION_SCHEMA[route.action as keyof typeof ACTION_SCHEMA];

    console.log(
      "ACTION_SCHEMA:",
      definition
        ? `OK RPC=${definition.rpc}`
        : "ERROR: acción inexistente"
    );
  }
}
