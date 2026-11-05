/** SQL values stay stable; labels and examples explain the effect on linked rows. */
export const relationRules = ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"];
export function relationRule(
  code,
  update = false,
  child = "la table liée",
  parent = "la table référencée",
) {
  if (code === "CASCADE")
    return {
      label: update
        ? "CASCADE — Mettre à jour les liens"
        : "CASCADE — Supprimer aussi les lignes liées",
      detail: update
        ? `Si une clé de « ${parent} » change, les valeurs correspondantes dans « ${child} » sont mises à jour pour conserver le lien.`
        : `Supprimer une ligne de « ${parent} » supprimera aussi toutes les lignes de « ${child} » qui la référencent. Leurs données seront supprimées.`,
    };
  if (code === "SET NULL")
    return {
      label: "SET NULL — Conserver les lignes sans lien",
      detail: `Les lignes de « ${child} » sont conservées, mais leur lien vers « ${parent} » devient vide (NULL). Les colonnes du lien doivent autoriser NULL.`,
    };
  return {
    label:
      code === "NO ACTION"
        ? "NO ACTION — Refuser l’opération"
        : update
          ? "RESTRICT — Empêcher la modification"
          : "RESTRICT — Empêcher la suppression",
    detail: update
      ? `La clé de « ${parent} » ne peut pas être modifiée tant que des lignes de « ${child} » l’utilisent. Modifiez ou retirez d’abord ces liens.`
      : `La ligne de « ${parent} » ne peut pas être supprimée tant que des lignes de « ${child} » la référencent. Modifiez ou retirez d’abord ces liens.`,
  };
}
