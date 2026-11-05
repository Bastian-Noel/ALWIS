<?php
require __DIR__ . "/lib/bootstrap.php";
$pages = [
    "dashboard" => "Le Campus",
    "students" => "Élèves",
    "courses" => "Cours",
    "calendar" => "Présences",
    "assignments" => "Notes",
    "messages" => "Messages",
    "resources" => "Documents",
];
$page = is_string($_GET["page"] ?? null) ? $_GET["page"] : "dashboard";
if (!isset($pages[$page])) {
    $page = "dashboard";
}
$notice = $_SESSION["notice"] ?? null;
$draft = $_SESSION["draft"] ?? [];
unset($_SESSION["notice"], $_SESSION["draft"]);
?>
<!doctype html>
<html lang="fr">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Campus des Tilleuls — <?= h($pages[$page]) ?></title>
        <link rel="icon" href="/assets/icons/feuille.svg" type="image/svg+xml">
        <link rel="stylesheet" href="/assets/css/site.css">
        <link rel="stylesheet" href="/assets/css/compact.css">
        <script src="/assets/js/site.js" defer></script>
    </head>
    <body>
        <a class="skip" href="#content">Aller au contenu</a>
        <header class="masthead">
            <a class="brand" href="/index.php">
                <img src="/assets/icons/feuille.svg" width="32" height="32" alt="">
                Campus des Tilleuls
            </a>
            <span>Un petit collège, des projets en commun.</span>
        </header>
        <div class="shell">
            <aside class="sidebar">
                <p class="eyebrow">L’année 2026–2027</p>
                <nav aria-label="Rubriques du Campus">
                    <?php foreach ($pages as $key => $label): ?>
                        <a href="/index.php?page=<?= h($key) ?>" <?= $page === $key ? 'aria-current="page"' : "" ?>><?= h($label) ?></a>
                    <?php endforeach; ?>
                    <a href="/atelier.html">L’atelier web ↗</a>
                </nav>
                <section class="visitor">
                    <span class="eyebrow">Votre visiteur</span>
          <strong id="profile"><?= h($user["name"]) ?></strong>
          <span><?= h($user["profile"]) ?></span>
                    <form method="post" action="/action.php">
                        <input type="hidden" name="csrf" value="<?= h($_SESSION["csrf"]) ?>">
                        <input type="hidden" name="action" value="profile">
                        <label>
                            Profil de cette session
                            <select name="user_id">
                                <?php foreach ($users as $person): ?>
                                    <option value="<?= $person["id"] ?>" <?= $person["id"] === $user["id"] ? "selected" : "" ?>>
                                        <?= h($person["name"]) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <button class="secondary">Changer de profil</button>
                    </form>
                    <small>Profils de démonstration, sans mot de passe.</small>
                </section>
            </aside>
            <main id="content">
                <div class="page-heading">
                    <div>
                        <p class="eyebrow">Campus / <?= h($pages[$page]) ?></p>
                        <h1><?= h($pages[$page]) ?></h1>
                    </div>
                    <span id="live-summary" role="status">Bienvenue</span>
                </div>
                <?php if ($notice): ?>
                    <p class="notice" role="status"><?= h($notice) ?></p>
                <?php endif; ?>
                <?php require __DIR__ . "/views/" . $page . ".php"; ?>
                <footer>Visite <?= (int) $_SESSION["visits"] ?> · Session <code id="session"><?= h(substr(session_id(), 0, 10)) ?></code> · PHP et MariaDB dans votre navigateur.</footer>
            </main>
        </div>
    </body>
</html>
