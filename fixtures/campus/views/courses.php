<div class="course-grid">
    <?php
    foreach (
        all(
            "SELECT c.*,u.name AS teacher,(SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) AS students FROM courses c JOIN users u ON u.id=c.teacher_id ORDER BY c.id",
        )
        as $course
    ):
    ?>
        <article class="panel course" style="--course:<?= h($course["color"]) ?>">
            <img
                src="/assets/icons/<?= $course["id"] === 2 ? "code" : "feuille" ?>.svg"
                alt=""
                width="40"
                height="40"
            >
            <p class="eyebrow"><?= h($course["teacher"]) ?></p>
            <h2><?= h($course["title"]) ?></h2>
            <p><?= (int) $course["students"] ?> élèves inscrits</p>
            <a href="/index.php?page=resources&amp;course=<?= (int) $course["id"] ?>">Voir les documents →</a>
        </article>
    <?php endforeach; ?>
</div>
<section class="panel">
    <h2>Les prochains rendez-vous</h2>
    <ul class="notes">
        <?php
        foreach (
            all(
                "SELECT l.*,c.title AS course FROM lessons l JOIN courses c ON c.id=l.course_id ORDER BY starts_at",
            )
            as $lesson
        ):
        ?>
            <li>
                <time><?= h($lesson["starts_at"]) ?></time>
                <p><strong><?= h($lesson["title"]) ?></strong> · <?= h($lesson["room"]) ?></p>
                <small><?= h($lesson["course"]) ?></small>
            </li>
        <?php endforeach; ?>
    </ul>
</section>
