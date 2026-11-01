<?php
function demand($ok,$why){if(!$ok)throw new RuntimeException($why);}
$registered=get_extension_funcs('mysqli');sort($registered);
$tested=[];$policies=[];
$db=mysqli_init();
demand(mysqli_options($db,MYSQLI_SET_CHARSET_NAME,'utf8mb4'),'pre-connect charset');
demand(mysqli_set_opt($db,MYSQLI_INIT_COMMAND,'SET @init_command = 99'),'init command option');
demand($db->real_connect('localhost','root','','test'),'real connect');
demand($db->query('SELECT @init_command')->fetch_column()==='99','init command applied');
$charset=mysqli_get_charset($db);demand($charset->charset==='utf8mb4'&&$charset->max_length===4,'charset metadata');
demand(mysqli_connect_errno()===0&&mysqli_connect_error()===null,'global successful connect diagnostic');
$tested[]='options/set_opt/get_charset/connect diagnostics';
demand(mysqli_real_query($db,"SELECT 'first' AS value UNION ALL SELECT 'second'"),'real query');
$r=mysqli_store_result($db);demand($r->fetch_all(MYSQLI_NUM)===[['first'],['second']],'store result');$r->free();
$db->real_query("SELECT 'one' AS value UNION ALL SELECT 'two'");$r=$db->use_result();
demand(mysqli_num_rows($r)===0&&$r->fetch_row()===['one'],'unbuffered first row');
try{$r->data_seek(0);throw new RuntimeException('unbuffered seek accepted');}catch(Error $expected){}
demand($r->fetch_all(MYSQLI_NUM)===[['two']]&&mysqli_num_rows($r)===2,'unbuffered remaining rows/count');$r->free();
$db->real_query("SELECT 'constructed'");$r=new mysqli_result($db);demand($r->fetch_column()==='constructed','result constructor');$r->free();
$tested[]='real_query/store_result/use_result and result constructor';
$other=new mysqli('localhost','root','','test');$stream=$other->query("SELECT 'first' UNION ALL SELECT 'second'",MYSQLI_USE_RESULT);$other->close();try{$stream->fetch_row();throw new RuntimeException('closed stream connection accepted');}catch(Error $expected){}$stream->free();
$other=mysqli_init();$other->options(MYSQLI_OPT_INT_AND_FLOAT_NATIVE,1);$other->real_connect('localhost','root','','test');demand($other->query("SELECT 42,1.25e0,CAST(18446744073709551615 AS UNSIGNED),CAST(1.2000 AS DECIMAL(6,4))")->fetch_row()===[42,1.25,'18446744073709551615','1.2000'],'native integer option preserves exact values');$other->real_query('SELECT 43');$stream=new mysqli_result($other,MYSQLI_USE_RESULT);demand($stream->fetch_column()===43,'unbuffered result constructor with native numbers');$stream->free();$other->close();

demand(mysqli_multi_query($db,"SELECT 'semi;colon'; SELECT 2; SET @finished=1"),'multi query');$sets=[];
do{$r=mysqli_store_result($db);if($r){$sets[]=$r->fetch_all(MYSQLI_NUM);$r->free();}}while(mysqli_more_results($db)&&mysqli_next_result($db));
demand($sets===[[["semi;colon"]],[["2"]]]&&!$db->more_results(),'multi sets and quoted semicolon: '.json_encode($sets));
demand($db->query('SELECT @finished')->fetch_column()==='1','multi query side effect');
mysqli_report(MYSQLI_REPORT_OFF);demand(!mysqli_real_query($db,'BROKEN SQL'),'SQL error expected');$errors=mysqli_error_list($db);demand(count($errors)===1&&$errors[0]['errno']===1064&&$errors[0]['sqlstate']==='42000','connection error list');mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
$db->query("SELECT CAST('not-a-number' AS UNSIGNED)")->free();$warnings=mysqli_get_warnings($db);demand($warnings instanceof mysqli_warning&&$warnings->errno===1292&&!$warnings->next(),'real warning object');
$tested[]='multi_query/more_results/next_result/error_list/get_warnings';
$s=$db->prepare('SELECT ? AS payload');$value=null;$s->bind_param('b',$value);
demand(mysqli_stmt_attr_set($s,MYSQLI_STMT_ATTR_UPDATE_MAX_LENGTH,1),'set statement attribute');demand(mysqli_stmt_attr_get($s,MYSQLI_STMT_ATTR_UPDATE_MAX_LENGTH)===1,'read statement attribute');
demand(mysqli_stmt_send_long_data($s,0,"A\0")&&$s->send_long_data(0,"B\xff"),'long chunks');$s->execute();demand($s->get_result()->fetch_column()==="A\0B\xff",'long-data exact bytes');
$s->reset();$value='bound-after-reset';$s->execute();demand($s->get_result()->fetch_column()===$value,'long-data reset and ordinary reexecute');
try{$s->send_long_data(0,str_repeat('x',8*1024*1024+1));throw new RuntimeException('long budget accepted');}catch(ValueError $expected){}
$s->send_long_data(0,'recovered');$s->execute();demand($s->get_result()->fetch_column()==='recovered','long budget recovery');demand(mysqli_stmt_error_list($s)===[],'statement error list');$s->close();
$db->query('DROP PROCEDURE IF EXISTS complete_multi');$db->query("CREATE PROCEDURE complete_multi() BEGIN SELECT 11; SELECT 22; END");
$s=$db->prepare('CALL complete_multi()');$s->execute();$sets=[];do{$r=$s->get_result();if($r){$sets[]=$r->fetch_all(MYSQLI_NUM);$r->free();}}while(mysqli_stmt_more_results($s)&&mysqli_stmt_next_result($s));demand($sets===[[[11]],[[22]]],'prepared routine multiple results');$s->close();
$tested[]='stmt attrs/send_long_data/reset/error_list/more_results/next_result';
$statistics=mysqli_stat($db);demand(is_string($statistics)&&$statistics!=='','server statistics: '.var_export($statistics,true));
demand(mysqli_get_links_stats()['total']===1,'link statistics');
foreach ([implode(';',array_fill(0,40,'SELECT 1')),implode(';',array_fill(0,12,"SELECT REPEAT('x',2097152)"))] as $pressure) {
 $refused=false;try{$db->multi_query($pressure);do{$r=$db->store_result();if($r)$r->free();}while($db->more_results()&&$db->next_result());}catch(mysqli_sql_exception $expected){$refused=str_contains($expected->getMessage(),'WASM result exceeds');}
 demand($refused,'queued result-set/aggregate memory budget');demand($db->query('SELECT 42')->fetch_column()==='42','connection recovery after multi-result refusal');
}
$tested[]='queued multi-result count and aggregate byte budgets with recovery';

foreach(['mysqlnd client stats'=>fn()=>mysqli_get_client_stats(),'mysqlnd connection stats'=>fn()=>mysqli_get_connection_stats($db),'debug'=>fn()=>mysqli_debug('d:t:o,trace'),'TLS'=>fn()=>mysqli_ssl_set($db,null,null,null,null,null),'async result'=>fn()=>mysqli_reap_async_query($db),'network timeout'=>fn()=>mysqli_options(mysqli_init(),MYSQLI_OPT_CONNECT_TIMEOUT,3),'cross-owner kill'=>fn()=>mysqli_kill($db,mysqli_thread_id($db)+100)]as $name=>$call){try{$call();throw new RuntimeException('unsupported API falsely succeeded: '.$name);}catch(LogicException $expected){$policies[$name]=$expected->getMessage();}}
$read=[];$errors=[];$reject=[];try{mysqli_poll($read,$errors,$reject,0);throw new RuntimeException('async poll accepted');}catch(LogicException $expected){$policies['poll']=$expected->getMessage();}
$before=mysqli_get_links_stats()['total'];try{new mysqli('localhost','root','','missing_database');throw new RuntimeException('missing database accepted');}catch(mysqli_sql_exception $expected){demand(mysqli_connect_errno()===1049&&str_contains(mysqli_connect_error(),'missing_database'),'failed global connect diagnostics: '.var_export([mysqli_connect_errno(),mysqli_connect_error(),$expected->getMessage(),$expected->getCode()],true));}demand(mysqli_get_links_stats()['total']===$before,'failed connection does not decrement existing links');
$db->close();demand(mysqli_get_links_stats()['total']===0,'links cleanup');
echo json_encode(['ok'=>true,'registered'=>$registered,'tested'=>$tested,'platformPolicies'=>$policies],JSON_THROW_ON_ERROR);
