const test = require('node:test');
const assert = require('node:assert/strict');
const { createDistributionQueue } = require('../src/distribution-queue');

test('entrega cada contato para somente um número', () => {
  const leads = Array.from({ length: 6 }, (_, index) => ({ id: index + 1 }));
  const queue = createDistributionQueue(leads, 4, ['a', 'b']);
  const first = queue.claim('a').assignment;
  const second = queue.claim('b').assignment;

  assert.notEqual(first.index, second.index);
  assert.equal(queue.snapshot().inFlight, 2);
});

test('repõe uma falha até alcançar a meta global de sucessos', () => {
  const leads = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
  const queue = createDistributionQueue(leads, 2, ['a', 'b']);
  const first = queue.claim('a').assignment;
  const second = queue.claim('b').assignment;
  assert.equal(queue.claim('a').status, 'wait');

  queue.complete(first.token, 'error');
  const replacement = queue.claim('a').assignment;
  queue.complete(second.token, 'sent');
  queue.complete(replacement.token, 'sent');

  assert.deepEqual(queue.snapshot(), {
    target: 2,
    sent: 2,
    errors: 1,
    attempted: 3,
    claimed: 3,
    candidateCount: 5,
    remainingCandidates: 2,
    inFlight: 0,
    stopped: false,
    finished: true,
    profiles: [
      { profileId: 'a', claimed: 2, sent: 1, errors: 1, inFlight: 0, target: 0 },
      { profileId: 'b', claimed: 1, sent: 1, errors: 0, inFlight: 0, target: 0 }
    ]
  });
});

test('não ultrapassa a meta mesmo com vários números simultâneos', () => {
  const queue = createDistributionQueue([1, 2, 3, 4], 2, ['a', 'b', 'c']);
  const first = queue.claim('a').assignment;
  const second = queue.claim('b').assignment;

  assert.equal(queue.claim('c').status, 'wait');
  queue.complete(first.token, 'sent');
  assert.equal(queue.claim('c').status, 'wait');
  queue.complete(second.token, 'sent');
  assert.equal(queue.claim('c').status, 'done');
  assert.equal(queue.snapshot().sent, 2);
});

test('parar impede novas reservas sem descartar o resultado em andamento', () => {
  const queue = createDistributionQueue([1, 2, 3], 3, ['a']);
  const assignment = queue.claim('a').assignment;
  queue.stop();
  assert.equal(queue.claim('a').status, 'done');
  queue.complete(assignment.token, 'sent');
  assert.equal(queue.snapshot().sent, 1);
  assert.equal(queue.snapshot().stopped, true);
});

test('respeita cotas efetivas personalizadas por número', () => {
  const queue = createDistributionQueue([1, 2, 3, 4, 5], 3, ['a', 'b'], { a: 1, b: 2 });
  const a = queue.claim('a').assignment;
  const b1 = queue.claim('b').assignment;
  queue.complete(a.token, 'sent');
  queue.complete(b1.token, 'error');

  assert.equal(queue.claim('a').status, 'done');
  const b2 = queue.claim('b').assignment;
  queue.complete(b2.token, 'sent');
  const b3 = queue.claim('b').assignment;
  queue.complete(b3.token, 'sent');

  const snapshot = queue.snapshot();
  assert.equal(snapshot.sent, 3);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.profiles.find((item) => item.profileId === 'a').sent, 1);
  assert.equal(snapshot.profiles.find((item) => item.profileId === 'b').sent, 2);
});

test('devolve o contato à fila quando o número remetente fica indisponível', () => {
  const queue = createDistributionQueue([{ phone: '1' }, { phone: '2' }], 2, ['vermelho', 'azul']);
  const first = queue.claim('vermelho').assignment;
  assert.equal(first.lead.phone, '1');
  assert.equal(queue.release(first.token), true);

  const reassigned = queue.claim('azul', ['azul']).assignment;
  assert.equal(reassigned.lead.phone, '1');
  queue.complete(reassigned.token, 'sent');
  const second = queue.claim('azul', ['azul']).assignment;
  assert.equal(second.lead.phone, '2');
  queue.complete(second.token, 'sent');

  const snapshot = queue.snapshot();
  assert.equal(snapshot.sent, 2);
  assert.equal(snapshot.errors, 0);
  assert.equal(snapshot.attempted, 2);
  assert.equal(snapshot.remainingCandidates, 0);
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.profiles.find((item) => item.profileId === 'vermelho').errors, 0);
  assert.equal(snapshot.profiles.find((item) => item.profileId === 'azul').sent, 2);
});

test('modo equilibrado compensa falhas usando os envios efetivos', () => {
  const queue = createDistributionQueue(Array.from({ length: 10 }, (_, index) => index), 4, ['a', 'b']);
  const a1 = queue.claim('a').assignment;
  const b1 = queue.claim('b').assignment;
  queue.complete(a1.token, 'sent');
  queue.complete(b1.token, 'error');

  assert.equal(queue.claim('a').status, 'wait');
  const b2 = queue.claim('b').assignment;
  queue.complete(b2.token, 'sent');

  const a2 = queue.claim('a').assignment;
  const b3 = queue.claim('b').assignment;
  queue.complete(a2.token, 'sent');
  queue.complete(b3.token, 'sent');

  const snapshot = queue.snapshot();
  assert.equal(snapshot.sent, 4);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.profiles.find((item) => item.profileId === 'a').sent, 2);
  assert.equal(snapshot.profiles.find((item) => item.profileId === 'b').sent, 2);
});

test('número disponível continua quando o outro está pausado ou indisponível', () => {
  const queue = createDistributionQueue([1, 2, 3], 3, ['a', 'b']);
  const first = queue.claim('a').assignment;
  queue.complete(first.token, 'sent');

  const next = queue.claim('a', ['a']);
  assert.equal(next.status, 'claimed');
  queue.complete(next.assignment.token, 'sent');
  assert.equal(queue.snapshot().profiles.find((item) => item.profileId === 'a').sent, 2);
});
