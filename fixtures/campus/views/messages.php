<section class="panel">
    <h2>Écrire à quelqu’un</h2>
    <form method="post" action="/action.php" class="message-form">
        <input type="hidden" name="csrf" value="<?= h($_SESSION["csrf"]) ?>">
        <input type="hidden" name="action" value="message">
        <label>
            Destinataire
            <select name="recipient_id" required>
                <option value="">Choisir un destinataire</option>
                <?php foreach ($users as $person): ?>
                    <option
                        value="<?= $person["id"] ?>"
                        <?= (int) ($draft["recipient_id"] ?? 0) === $person["id"] ? "selected" : "" ?>
                    >
                        <?= h($person["name"]) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </label>
        <label>
            Objet
            <input
                name="subject"
                maxlength="120"
                required
                value="<?= h($draft["subject"] ?? "") ?>"
            >
        </label>
        <label>
            Message
            <textarea name="body" maxlength="4000" required><?= h($draft["body"] ?? "") ?></textarea>
        </label>
        <button>Envoyer</button>
    </form>
</section>
<section class="panel">
    <h2>Votre boîte de réception</h2>
    <?php
    $messages = all(
        "SELECT m.*,u.name FROM messages m JOIN message_recipients r ON r.message_id=m.id JOIN users u ON u.id=m.sender_id WHERE r.user_id=? ORDER BY m.id DESC LIMIT 30",
        [$user["id"]],
    );
    ?>
    <?php if (!$messages): ?>
        <p>Pas encore de message. Envoyez-en un depuis une autre session.</p>
    <?php endif; ?>
    <?php foreach ($messages as $message): ?>
        <article class="message">
            <small><?= h($message["name"]) ?> · <?= h($message["created_at"]) ?></small>
            <h3><?= h($message["subject"]) ?></h3>
            <p><?= nl2br(h($message["body"])) ?></p>
        </article>
    <?php endforeach; ?>
</section>
