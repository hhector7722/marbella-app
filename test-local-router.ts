type RoutedAction = {
  action: string;
  arguments: Record<string, unknown>;
};

function routeLocal(text: string): RoutedAction | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized.includes("proveedor") ||
    normalized.includes("proveedores")
  ) {
    const searchMatch = normalized.match(
      /(?:busca|buscar|encuentra|encontrar)\s+(?:el\s+)?(?:proveedor\s+)?(.+)/
    );

    if (searchMatch?.[1]) {
      return {
        action: "gestionar_proveedores",
        arguments: {
          p_accion: "buscar",
          p_datos: {
            nombre: searchMatch[1].trim(),
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
  "¿Qué proveedores tenemos?",
  "Dime nuestros proveedores",
  "Busca Ametller",
  "Buscar proveedor Carnicas Pijuan",
  "¿Qué recetas tenemos?",
  "Enséñame las recetas",
  "¿Qué ingredientes tenemos?",
  "¿Cuánto stock tenemos?",
  "Muéstrame los empleados",
  "¿Qué usuarios tenemos?",
  "¿Cuánto hemos vendido esta semana?",
];

for (const prompt of tests) {
  console.log("\nPROMPT:", prompt);
  console.log("ROUTE:", JSON.stringify(routeLocal(prompt), null, 2));
}
