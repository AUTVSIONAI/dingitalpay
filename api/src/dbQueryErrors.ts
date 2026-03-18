type DbErrorLike = {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
};

export type DbQueryHttpError = { httpStatus: number; code: string; message: string };

export function mapDbErrorToHttp(err: unknown, ctx?: { table?: string; action?: string }): DbQueryHttpError {
  const e = (err || {}) as DbErrorLike;
  const pgCode = String(e.code || "").trim();
  const msg = String(e.message || "").trim();
  const constraint = String(e.constraint || "").trim();

  if (pgCode === "23503") {
    // Foreign key violation (e.g. can't delete product with orders).
    if (constraint === "orders_product_id_fkey") {
      return { httpStatus: 409, code: "DB_CONFLICT_FK", message: "Não é possível excluir um produto com vendas (pedidos) vinculadas. Arquive o produto." };
    }
    return { httpStatus: 409, code: "DB_CONFLICT_FK", message: "Conflito: existem registros vinculados (chave estrangeira)." };
  }

  if (pgCode === "22P02") {
    // invalid_text_representation covers invalid JSON, UUID, etc.
    if (/type\s+json/i.test(msg) || /json/i.test(msg)) {
      return { httpStatus: 422, code: "DB_INVALID_JSON", message: "JSON inválido em um campo de configuração. Verifique os dados e tente novamente." };
    }
    return { httpStatus: 400, code: "DB_INVALID_INPUT", message: "Valor inválido. Verifique os dados e tente novamente." };
  }

  // Conservative default: do not leak internals.
  const fallbackMessage = ctx?.action === "delete"
    ? "Não foi possível excluir. Tente novamente."
    : "Não foi possível salvar. Tente novamente.";
  return { httpStatus: 500, code: "INTERNAL_ERROR", message: fallbackMessage };
}

