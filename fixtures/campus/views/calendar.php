<?php
// MySQLi natif : résultats préparés et clé primaire composée.
require __DIR__ . "/../lib/mysqli.php";
$lesson = (int) ($_GET["lesson"] ?? 1);
$result = $mysqli->execute_query(
    "SELECT a.student_id,u.name,a.status FROM attendance a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id WHERE a.lesson_id=? ORDER BY u.name",
    [$lesson],
);
?>
<section class="panel">
    <h2>La feuille de présence</h2>
    <form method="get">
        <input type="hidden" name="page" value="calendar">
        <label>
            Séance
            <select name="lesson">
                <?php foreach (all("SELECT id,title FROM lessons ORDER BY id") as $row): ?>
                    <option value="<?= $row["id"] ?>" <?= $lesson === $row["id"] ? "selected" : "" ?>>
                        <?= h($row["title"]) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </label>
        <button class="secondary">Afficher</button>
    </form>
    <?php
    while ($row = $result->fetch_assoc()):
    ?>
        <form method="post" action="/action.php" class="attendance-row">
            <input type="hidden" name="csrf" value="<?= h($_SESSION["csrf"]) ?>">
            <input type="hidden" name="action" value="attendance">
            <input type="hidden" name="lesson_id" value="<?= $lesson ?>">
            <input type="hidden" name="student_id" value="<?= $row["student_id"] ?>">
            <strong><?= h($row["name"]) ?></strong>
            <?php if (staff()): ?>
                <label>
                    Présence de <?= h($row["name"]) ?>
                    <select name="status">
                        <?php foreach (["présent", "absent", "retard"] as $status): ?>
                            <option <?= $status === $row["status"] ? "selected" : "" ?>><?= h($status) ?></option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <button>Mettre à jour la présence</button>
            <?php else: ?>
                <span class="badge"><?= h($row["status"]) ?></span>
            <?php endif; ?>
        </form>
    <?php
    endwhile;
    $result->free();
    $mysqli->close();
    ?>
    <p class="muted">Cette rubrique utilise MySQLi. Les autres formulaires utilisent PDO.</p>
</section>
