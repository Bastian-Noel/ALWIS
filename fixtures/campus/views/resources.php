<section class="panel">
    <h2>Les supports de cours</h2>
    <ul class="notes">
        <?php
        foreach (
            all(
                "SELECT r.*,c.title AS course FROM resources r JOIN courses c ON c.id=r.course_id WHERE (?=0 OR r.course_id=?) ORDER BY r.id DESC",
                [(int) ($_GET["course"] ?? 0), (int) ($_GET["course"] ?? 0)],
            )
            as $resource
        ):
        ?>
            <li>
                <p><a href="/download.php?id=<?= $resource["id"] ?>"><?= h($resource["title"]) ?></a></p>
                <small><?= h($resource["course"]) ?> · <?= h($resource["mime"]) ?></small>
            </li>
        <?php endforeach; ?>
    </ul>
</section>
<?php if (staff()): ?>
    <section class="panel">
        <h2>Partager un document</h2>
        <p>
            TXT, CSV, PNG ou JPEG, au maximum 512 Kio. Le fichier est conservé dans uploads/documents et sa
            description dans MariaDB.
        </p>
        <form method="post" action="/action.php" enctype="multipart/form-data">
            <input type="hidden" name="csrf" value="<?= h($_SESSION["csrf"]) ?>">
            <input type="hidden" name="action" value="upload">
            <label>
                Cours
                <select name="course_id">
                    <?php foreach (all("SELECT id,title FROM courses ORDER BY id") as $course): ?>
                        <option
                            value="<?= $course["id"] ?>"
                            <?= (int) ($draft["course_id"] ?? 0) === $course["id"] ? "selected" : "" ?>
                        >
                            <?= h($course["title"]) ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>
                Titre du document
                <input name="title" maxlength="120" required value="<?= h($draft["title"] ?? "") ?>">
            </label>
            <label>
                Fichier
                <input type="file" name="attachment" accept=".txt,.csv,.png,.jpg,.jpeg" required>
            </label>
            <button>Partager le document</button>
        </form>
    </section>
<?php endif; ?>
