<?php
$assignments = all("SELECT id,title FROM assignments ORDER BY id");
$requestedAssignment = (int) ($_GET["assignment"] ?? ($assignments[0]["id"] ?? 0));
$assignment = null;
foreach ($assignments as $candidate) {
    if ((int) $candidate["id"] === $requestedAssignment) {
        $assignment = $candidate;
        break;
    }
}
$assignment ??= $assignments[0] ?? null;
$students = all("SELECT s.id,u.name FROM students s JOIN users u ON u.id=s.user_id ORDER BY s.id");
$student = (int) ($_GET["student"] ?? ($students[0]["id"] ?? 0));
if (!array_filter($students, fn($person) => (int) $person["id"] === $student)) {
    $student = (int) ($students[0]["id"] ?? 0);
}
?>
<section class="panel">
    <h2>Notes et appréciations</h2>
    <p>Une note vide signifie « à rendre ». Les valeurs décimales sont conservées sans calcul en nombre flottant.</p>
    <div class="table-scroll">
        <table>
            <caption>Résultats de tous les travaux</caption>
            <thead><tr><th>Élève</th><th>Travail</th><th>Note / 20</th><th>Appréciation</th></tr></thead>
            <tbody>
                <?php foreach (all("SELECT u.name,a.title,g.score,g.comment FROM grades g JOIN students s ON s.id=g.student_id JOIN users u ON u.id=s.user_id JOIN assignments a ON a.id=g.assignment_id ORDER BY a.id,s.id") as $row): ?>
                    <tr><td><?= h($row["name"]) ?></td><td><?= h($row["title"]) ?></td><td><?= h($row["score"] ?? "À rendre") ?></td><td><?= h($row["comment"]) ?></td></tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php if (staff() && $assignment): ?>
        <form method="get">
            <input type="hidden" name="page" value="assignments">
            <label>Travail à corriger
                <select name="assignment">
                    <?php foreach ($assignments as $item): ?>
                        <option value="<?= (int) $item["id"] ?>" <?= (int) $assignment["id"] === (int) $item["id"] ? "selected" : "" ?>><?= h($item["title"]) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>Élève à évaluer
                <select name="student">
                    <?php foreach ($students as $person): ?>
                        <option value="<?= (int) $person["id"] ?>" <?= $student === (int) $person["id"] ? "selected" : "" ?>><?= h($person["name"]) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <button class="secondary">Charger la note</button>
        </form>
        <?php
        $grade = all("SELECT score,comment,version FROM grades WHERE assignment_id=? AND student_id=?", [$assignment["id"], $student])[0] ?? null;
        ?>
        <?php if ($grade): ?>
            <h3><?= h($assignment["title"]) ?> · <?= h(array_values(array_filter($students, fn($person) => (int) $person["id"] === $student))[0]["name"] ?? "Élève") ?></h3>
            <form method="post" action="/action.php" id="grade-form">
                <input type="hidden" name="csrf" value="<?= h($_SESSION["csrf"]) ?>">
                <input type="hidden" name="action" value="grade">
                <input type="hidden" name="assignment_id" value="<?= (int) $assignment["id"] ?>">
                <input type="hidden" name="student_id" value="<?= $student ?>">
                <input type="hidden" name="version" value="<?= (int) $grade["version"] ?>">
                <label>Note sur 20
                    <input name="score" inputmode="decimal" pattern="(?:[0-9]|1[0-9]|20)(?:[.,][0-9]{1,2})?" value="<?= h($draft["score"] ?? ($grade["score"] ?? "")) ?>">
                </label>
                <label>Appréciation
                    <input name="comment" maxlength="240" value="<?= h($draft["comment"] ?? $grade["comment"]) ?>">
                </label>
                <button>Enregistrer</button>
            </form>
        <?php endif; ?>
        <p class="muted">Deux professeurs peuvent ouvrir la même note : une version périmée est refusée, avec conservation de la saisie.</p>
    <?php endif; ?>
</section>
