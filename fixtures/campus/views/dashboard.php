<section class="hero">
    <div>
        <p class="eyebrow">Apprendre ensemble</p>
        <h2>Les petites idées font les grands projets.</h2>
        <p>
            Le jardin, les sciences et le web : retrouvez la vie du Campus et participez avec votre propre
            session.
        </p>
        <a class="button" href="/index.php?page=courses">Découvrir les cours</a>
    </div>
    <img
        src="/assets/images/campus.png"
        alt="Illustration du collège et de son jardin"
        width="640"
        height="360"
    >
</section>
<div class="stats">
    <?php
    foreach (
        ["students" => "élèves", "courses" => "cours", "resources" => "documents"]
        as $table => $label
    ):
    ?>
        <article><strong><?= $db->query("SELECT COUNT(*) FROM " . $table)->fetchColumn() ?></strong><span><?= h($label) ?></span></article>
    <?php endforeach; ?>
</div>
<section class="panel">
    <div class="section-heading">
        <h2>Le carnet commun</h2>
        <span>Partagé entre les visiteurs</span>
    </div>
    <form method="post" action="/action.php" class="inline">
        <input type="hidden" name="csrf" value="<?= h($_SESSION["csrf"]) ?>">
        <input type="hidden" name="action" value="note">
        <label>
            Nouvelle note
            <input name="label" maxlength="200" required value="<?= h($draft["label"] ?? "") ?>">
        </label>
        <button>Ajouter à la base commune</button>
    </form>
    <ul id="notes" class="notes">
        <?php
        foreach (
            all(
                "SELECT n.label,u.name FROM studio_notes n JOIN users u ON u.id=n.author_id ORDER BY n.id DESC LIMIT 30",
            )
            as $note
        ):
        ?>
            <li>
                <p><?= h($note["label"]) ?></p>
                <small><?= h($note["name"]) ?></small>
            </li>
        <?php endforeach; ?>
    </ul>
</section>
<aside class="tip">
    <h2>Un projet pour explorer ALWIS</h2>
    <p>
        Ouvrez une autre session pour partager le carnet, modifier une note ou envoyer un message.
        Regardez ensuite la requête dans Réseau et les relations dans Schéma.
    </p>
    <a href="/atelier.html">Tester HTML, JavaScript, SVG et les formulaires →</a>
</aside>
