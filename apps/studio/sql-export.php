<?php
/** Logical export executed inside the native PHP/MariaDB runtime, not on a server. */
declare(strict_types=1);
header('Content-Type: application/json');
$name=$_GET['database']??'';
if(!is_string($name)||$name===''||strlen($name)>256||str_contains($name,"\0"))throw new RuntimeException('Nom de base invalide.');
function qi(string $value): string { return '`'.str_replace('`','``',$value).'`'; }
function valueSQL(?string $value,bool $binary=false,bool $bit=false): string {if($value!==null&&$bit){$bits='';for($i=0;$i<strlen($value);$i++)$bits.=str_pad(decbin(ord($value[$i])),8,'0',STR_PAD_LEFT);return "b'".$bits."'";}return $value===null?'NULL':($binary?"X'".bin2hex($value)."'":"CONVERT(X'".bin2hex($value)."' USING utf8mb4)");}
$db=new PDO('mysql:charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$schema=$db->prepare('SELECT DEFAULT_CHARACTER_SET_NAME,DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?');$schema->execute([$name]);$settings=$schema->fetch(PDO::FETCH_NUM);$schema->closeCursor();
if(!$settings||in_array($name,['mysql','information_schema','performance_schema','sys'],true))throw new RuntimeException('Choisissez une base de projet.');
$db->exec('USE '.qi($name));
$event=$db->prepare('SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?');$event->execute([$name]);$events=(int)$event->fetchColumn();$event->closeCursor();
if($events)throw new RuntimeException('Cette version refuse les bases contenant des événements SQL pour éviter une sauvegarde incomplète.');
$tables=[];$views=[];
foreach($db->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM) as [$table,$kind]){
 if($kind==='BASE TABLE')$tables[]=$table;elseif($kind==='VIEW')$views[]=$table;else throw new RuntimeException('Type non exporté : '.$kind);
}
$file=fopen(__FILE__.'.sql','wb');if(!$file)throw new RuntimeException('Création du fichier SQL impossible.');$size=0;
function emit(string $sql): void {
 global $file,$size;$size+=strlen($sql);if($size>8*1024*1024)throw new RuntimeException('Export SQL limité à 8 Mio.');
 $offset=0;while($offset<strlen($sql)){$n=fwrite($file,substr($sql,$offset));if(!$n)throw new RuntimeException('Écriture SQL incomplète.');$offset+=$n;}
}
try{
 emit("-- WASMWebServer logical project export; restore into a separate project.\nSET @PBL_OLD_FK=@@FOREIGN_KEY_CHECKS;\nSET @PBL_OLD_MODE=@@SQL_MODE;\nSET FOREIGN_KEY_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\nSET NAMES utf8mb4;\n");
 emit('CREATE DATABASE IF NOT EXISTS '.qi($name).' CHARACTER SET '.qi($settings[0]).' COLLATE '.qi($settings[1]).";\nUSE ".qi($name).";\n");
 foreach($views as $view)emit('DROP VIEW IF EXISTS '.qi($view).";\n");
 // Dummy view tables make the later view definitions independent of name ordering.
 foreach($views as $view){$columns=$db->query('SHOW COLUMNS FROM '.qi($view))->fetchAll(PDO::FETCH_ASSOC);emit('CREATE TABLE '.qi($view).' ('.implode(',',array_map(fn($c)=>qi($c['Field']).' '.$c['Type'].' NULL',$columns)).");\n");}
 $routines=$db->prepare('SELECT ROUTINE_NAME,ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? ORDER BY ROUTINE_TYPE,ROUTINE_NAME');$routines->execute([$name]);$definitions=$routines->fetchAll(PDO::FETCH_NUM);$routines->closeCursor();
 foreach($definitions as [$routine,$type]){
  if(!in_array($type,['FUNCTION','PROCEDURE'],true))throw new RuntimeException('Routine non reconnue.');
  $definition=$db->query('SHOW CREATE '.$type.' '.qi($routine))->fetch(PDO::FETCH_ASSOC);
  $create=$definition['Create '.ucfirst(strtolower($type))]??null;if(!$create)throw new RuntimeException('Définition de routine indisponible.');
  emit('DROP '.$type.' IF EXISTS '.qi($routine).";\nSET SQL_MODE=".valueSQL($definition['sql_mode']).";\n".$create.";\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n");
 }
 foreach($tables as $table){
  $ddl=$db->query('SHOW CREATE TABLE '.qi($table))->fetch(PDO::FETCH_NUM)[1];emit('DROP TABLE IF EXISTS '.qi($table).";\n".$ddl.";\n");
  $columns=$db->query('SHOW FULL COLUMNS FROM '.qi($table))->fetchAll(PDO::FETCH_ASSOC);
  $columns=array_values(array_filter($columns,fn($c)=>!preg_match('/(?:VIRTUAL|STORED|PERSISTENT) GENERATED/i',$c['Extra']??'')));
  $names=implode(',',array_map(fn($c)=>qi($c['Field']),$columns));
  $rows=$db->query('SELECT '.$names.' FROM '.qi($table));
  while($row=$rows->fetch(PDO::FETCH_NUM)){
   $values=[];foreach($row as $i=>$value){$binary=(bool)preg_match('/^(?:varbinary|binary|(?:tiny|medium|long)?blob|bit|geometry|(?:multi)?(?:point|linestring|polygon)|geometrycollection)\b/i',$columns[$i]['Type']);$values[]=valueSQL($value===null?null:(string)$value,$binary,(bool)preg_match('/^bit\b/i',$columns[$i]['Type']));}
   emit('INSERT INTO '.qi($table).' ('.$names.') VALUES ('.implode(',',$values).");\n");
  }
  $rows->closeCursor();
 }
 foreach($views as $view){$ddl=$db->query('SHOW CREATE VIEW '.qi($view))->fetch(PDO::FETCH_NUM)[1];emit('DROP TABLE '.qi($view).";\n".$ddl.";\n");}
 foreach($db->query('SHOW TRIGGERS')->fetchAll(PDO::FETCH_ASSOC) as $trigger){
  $definition=$db->query('SHOW CREATE TRIGGER '.qi($trigger['Trigger']))->fetch(PDO::FETCH_ASSOC);
  $create=$definition['SQL Original Statement']??null;if(!$create)throw new RuntimeException('Définition de trigger indisponible.');
  emit('SET SQL_MODE='.valueSQL($definition['sql_mode']).";\n".$create.";\n");
 }
 emit("SET SQL_MODE=@PBL_OLD_MODE;\nSET FOREIGN_KEY_CHECKS=@PBL_OLD_FK;\n");
 if(!fclose($file))throw new RuntimeException('Fermeture SQL impossible.');$file=null;
 echo json_encode(['ok'=>true,'bytes'=>$size,'tables'=>count($tables),'views'=>count($views),'routines'=>count($definitions)],JSON_THROW_ON_ERROR);
}finally{if(is_resource($file))fclose($file);}
