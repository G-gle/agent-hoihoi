import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function database({migrate=true}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const apply=name=>sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  for(const name of ['0001_environment_check.sql','0002_page_requests.sql','0003_guestbook.sql','0004_article_page_requests.sql'])apply(name);
  if(migrate)for(const name of ['0005_participation.sql','0006_registered_article_logs.sql'])apply(name);
  const db={sqlite,apply,failRead:false,failWrite:false,loseWriteResponse:false,
    withSession(mode){if(mode!=='first-primary')throw new Error('Must use primary');return db;},
    prepare(sql){
      const make=params=>({sql,params,bind(...values){return make(values);},
        async first(){if(db.failRead)throw new Error('private DB error');return sqlite.prepare(sql).get(...params)??null;},
        async all(){if(db.failRead)throw new Error('private DB error');return {success:true,results:sqlite.prepare(sql).all(...params)};},
        async run(){if(db.failWrite)throw new Error('private DB error');const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}});
      return make([]);
    },
    async batch(statements){
      if(db.failWrite)throw new Error('private DB error');
      sqlite.exec('BEGIN');
      let results;
      try{results=statements.map(s=>{const r=sqlite.prepare(s.sql).run(...s.params);return {success:true,meta:{changes:Number(r.changes)}};});sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
      if(db.loseWriteResponse)throw new Error('response lost');
      return results;
    },
  };
  return db;
}
