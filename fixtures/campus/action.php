<?php
require __DIR__ . "/lib/bootstrap.php";
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    header("Allow: POST");
    exit("Utilisez un formulaire du Campus.");
}
if (!is_string($_POST["csrf"] ?? null) || !hash_equals($_SESSION["csrf"], $_POST["csrf"])) {
    http_response_code(403);
    exit("Ce formulaire a expiré. Actualisez la page.");
}
$action = is_string($_POST["action"] ?? null) ? $_POST["action"] : "";
$next =
    [
        "profile" => "dashboard",
        "note" => "dashboard",
        "grade" => "assignments",
        "attendance" => "calendar",
        "message" => "messages",
        "upload" => "resources",
    ][$action] ?? "dashboard";
// Garder le contexte même en cas de validation ou de conflit.
$contextKey = $action === "grade" ? "student_id" : ($action === "attendance" ? "lesson_id" : null);
if ($contextKey && is_string($_POST[$contextKey] ?? null) && ctype_digit($_POST[$contextKey])) {
    $next .= ($action === "grade" ? "&student=" : "&lesson=") . (int) $_POST[$contextKey];
}
if ($action === "grade" && is_string($_POST["assignment_id"] ?? null) && ctype_digit($_POST["assignment_id"])) {
    $next .= "&assignment=" . (int) $_POST["assignment_id"];
}
$uploaded = null;
try {
    if (in_array($action, ["grade", "attendance", "upload"], true) && !staff()) {
        http_response_code(403);
        exit("Cette action est réservée à l’équipe pédagogique.");
    }
    if ($action === "profile") {
        $id = positive($_POST["user_id"] ?? null);
        if (!all("SELECT id FROM users WHERE id=?", [$id])) {
            throw new RuntimeException("Ce profil n’existe plus.");
        }
        session_regenerate_id(true);
        $_SESSION["user_id"] = $id;
        $_SESSION["notice"] = "Profil changé pour cette session uniquement.";
    } elseif ($action === "note") {
        $query = $db->prepare("INSERT INTO studio_notes(author_id,label) VALUES(?,?)");
        $query->execute([$user["id"], textInput("label", 200)]);
        $_SESSION["notice"] = "Le carnet commun a été mis à jour.";
    } elseif ($action === "grade") {
        $student = positive($_POST["student_id"] ?? null);
        $assignment = positive($_POST["assignment_id"] ?? null);
        $version = positive($_POST["version"] ?? null);
        $score = $_POST["score"] ?? "";
        if (!is_string($score)) {
            throw new RuntimeException("Saisissez une note entre 0 et 20.");
        }
        $score = str_replace(",", ".", trim($score));
        if (
            $score !== "" &&
            (!preg_match('/^(?:[0-9]|1[0-9]|20)(?:\.[0-9]{1,2})?$/D', $score) ||
                (float) $score > 20)
        ) {
            throw new RuntimeException(
                "La note doit être comprise entre 0 et 20, avec au plus deux décimales.",
            );
        }
        $comment = $_POST["comment"] ?? "";
        if (!is_string($comment) || mb_strlen($comment) > 240) {
            throw new RuntimeException("L’appréciation est limitée à 240 caractères.");
        }
        $query = $db->prepare(
            "UPDATE grades SET score=?,comment=?,version=version+1 WHERE assignment_id=? AND student_id=? AND version=?",
        );
        $query->execute([$score === "" ? null : $score, $comment, $assignment, $student, $version]);
        if ($query->rowCount() !== 1) {
            throw new RuntimeException(
                "Cette note a changé dans une autre session. Rechargez sa version avant de réessayer ; votre saisie est conservée.",
            );
        }
        $_SESSION["notice"] = "Note enregistrée.";
    } elseif ($action === "attendance") {
        $status = $_POST["status"] ?? null;
        if (!in_array($status, ["présent", "absent", "retard"], true)) {
            throw new RuntimeException("Choisissez un état de présence.");
        }
        $lesson = positive($_POST["lesson_id"] ?? null);
        $student = positive($_POST["student_id"] ?? null);
        if (
            !all(
                "SELECT a.student_id FROM attendance a JOIN lessons l ON l.id=a.lesson_id WHERE a.lesson_id=? AND a.student_id=?",
                [$lesson, $student],
            )
        ) {
            throw new RuntimeException("Cette ligne de présence n’existe pas.");
        }
        require __DIR__ . "/lib/mysqli.php";
        $statement = $mysqli->prepare(
            "UPDATE attendance SET status=? WHERE lesson_id=? AND student_id=?",
        );
        $statement->bind_param("sii", $status, $lesson, $student);
        $statement->execute();
        $statement->close();
        $mysqli->close();
        $_SESSION["notice"] = "Présence mise à jour avec MySQLi.";
    } elseif ($action === "message") {
        $recipient = positive($_POST["recipient_id"] ?? null);
        $subject = textInput("subject", 120);
        $body = textInput("body", 4000);
        $db->beginTransaction();
        $query = $db->prepare("INSERT INTO messages(sender_id,subject,body) VALUES(?,?,?)");
        $query->execute([$user["id"], $subject, $body]);
        $query = $db->prepare("INSERT INTO message_recipients(message_id,user_id) VALUES(?,?)");
        $query->execute([$db->lastInsertId(), $recipient]);
        $db->commit();
        $_SESSION["notice"] = "Message envoyé.";
    } elseif ($action === "upload") {
        $course = positive($_POST["course_id"] ?? null);
        $title = textInput("title", 120);
        $file = $_FILES["attachment"] ?? null;
        if (
            !$file ||
            !is_int($file["error"]) ||
            $file["error"] !== UPLOAD_ERR_OK ||
            !is_string($file["name"]) ||
            !is_string($file["tmp_name"])
        ) {
            throw new RuntimeException("Choisissez un fichier valide à envoyer.");
        }
        if ($file["size"] > 524288 || $file["size"] < 1) {
            throw new RuntimeException("Le fichier doit contenir entre 1 octet et 512 Kio.");
        }
        $ext = strtolower(pathinfo($file["name"], PATHINFO_EXTENSION));
        $types = [
            "txt" => "text/plain",
            "csv" => "text/csv",
            "png" => "image/png",
            "jpg" => "image/jpeg",
            "jpeg" => "image/jpeg",
        ];
        if (!isset($types[$ext])) {
            throw new RuntimeException("Formats acceptés : TXT, CSV, PNG et JPEG.");
        }
        if (in_array($ext, ["png", "jpg", "jpeg"], true)) {
            $info = getimagesize($file["tmp_name"]);
            if (!$info || $info["mime"] !== $types[$ext]) {
                throw new RuntimeException(
                    "Le contenu de l’image ne correspond pas à son extension.",
                );
            }
        }
        if (!is_dir(__DIR__ . "/uploads/documents")) {
            mkdir(__DIR__ . "/uploads/documents", 0777, true);
        }
        $path = "uploads/documents/" . bin2hex(random_bytes(12)) . "." . $ext;
        $uploaded = __DIR__ . "/" . $path;
        if (!move_uploaded_file($file["tmp_name"], $uploaded)) {
            throw new RuntimeException("Impossible de conserver le document.");
        }
        $query = $db->prepare(
            "INSERT INTO resources(course_id,author_id,title,path,mime,bytes) VALUES(?,?,?,?,?,?)",
        );
        $query->execute([$course, $user["id"], $title, $path, $types[$ext], $file["size"]]);
        $_SESSION["notice"] = "Document partagé.";
    } else {
        throw new RuntimeException("Action inconnue.");
    }
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    if ($uploaded && is_file($uploaded)) {
        unlink($uploaded);
    }
    $_SESSION["draft"] = array_filter(
        array_intersect_key(
            $_POST,
            array_flip([
                "label",
                "score",
                "comment",
                "subject",
                "body",
                "recipient_id",
                "title",
                "course_id",
            ]),
        ),
        "is_string",
    );
    $_SESSION["notice"] =
        $error instanceof PDOException
            ? "Données invalides ou destinataire inexistant. La saisie est conservée."
            : $error->getMessage();
}
header("Location: /index.php?page=" . $next, true, 303);
