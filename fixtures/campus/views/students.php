<section class="panel">
    <h2>Une classe, plusieurs parcours</h2>
    <label>
        Filtrer les élèves
        <input type="search" data-filter="#students" placeholder="Un prénom, une classe…">
    </label>
    <div class="table-scroll">
        <table id="students">
            <caption>Élèves et responsables</caption>
            <thead>
                <tr>
                    <th>Élève</th>
                    <th>Classe</th>
                    <th>Responsable</th>
                    <th>Cours suivis</th>
                </tr>
            </thead>
            <tbody>
                <?php
                foreach (
                    all(
                        "SELECT s.id,u.name,c.name AS class_name,g.name AS guardian,(SELECT COUNT(*) FROM enrollments e WHERE e.student_id=s.id) AS courses FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id LEFT JOIN users g ON g.id=s.guardian_id ORDER BY u.name",
                    )
                    as $row
                ):
                ?>
                    <tr>
                        <td><?= h($row["name"]) ?></td>
                        <td><?= h($row["class_name"]) ?></td>
                        <td><?= h($row["guardian"] ?? "Non renseigné") ?></td>
                        <td><?= (int) $row["courses"] ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</section>
