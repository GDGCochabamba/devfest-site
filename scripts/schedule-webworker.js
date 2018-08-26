function getTimeDifference(date, startTime, endTime) {
  const timezone = new Date().toString().match(/([A-Z]+[+-][0-9]+.*)/)[1];
  const timeStart = new Date(date + ' ' + startTime + ' ' + timezone).getTime();
  const timeEnd = new Date(date + ' ' + endTime + ' ' + timezone).getTime();
  return timeEnd - timeStart;
}

function getEndTime(date, startTime, endTime, totalNumber, number) {
  const timezone = new Date().toString().match(/([A-Z]+[+-][0-9]+.*)/)[1];
  const timeStart = new Date(`${date} ${startTime} ${timezone}`).getTime();
  const difference = Math.floor(getTimeDifference(date, startTime, endTime) / totalNumber);
  const result = new Date(timeStart + difference * number);
  return result.getHours() + ':' + result.getMinutes();
}

function getDuration(date, startTime, endTime) {
  let difference = getTimeDifference(date, startTime, endTime);
  const hh = Math.floor(difference / 1000 / 60 / 60);
  difference -= hh * 1000 * 60 * 60;
  return {
    hh,
    mm: Math.floor(difference / 1000 / 60),
  };
}

function addTagTo(array, element) {
  if (array.indexOf(element) < 0) {
    return [...array, element];
  }
}

function updateSpeakersSessions(speakersRaw, speakerIds, session) {
  let result = {};
  for (let i = 0; i < speakerIds.length; i++) {
    const speaker = speakersRaw[speakerIds[i]];
    if (speaker) {
      result[speakerIds[i]] = Object.assign({}, speaker, {
        sessions: speaker.sessions
          ? speaker.sessions.map((speakerSession) => speakerSession.id === session.id
            ? session
            : speakerSession)
          : [session],
      });
    }
  }
  return result;
}

self.addEventListener('message', ({ data }) => {
  const speakersRaw = data.speakers;
  const sessionsRaw = data.sessions;
  const scheduleRaw = data.schedule;

  let schedule = {};
  let sessions = {};
  let speakers = {};
  let scheduleTags = [];

  for (const dayKey of Object.keys(scheduleRaw)) {
    const day = scheduleRaw[dayKey];
    const tracksNumber = day.tracks.length;
    let dayTags = [];
    let timeslots = [];
    let extensions = {};

    const timeslotLen = day.timeslots.length;
    for (let timeslotsIndex = 0; timeslotsIndex < timeslotLen; timeslotsIndex++) {
      const timeslot = day.timeslots[timeslotsIndex];
      let innerSessions = [];

      if (!timeslot.sessions) {
        timeslot.sessions = [];
      }
      const sessionsLen = timeslot.sessions.length;
      for (let sessionIndex = 0; sessionIndex < sessionsLen; sessionIndex++) {
        let subSessions = [];

        if (!timeslot.sessions[sessionIndex]) {
          continue;
        }
        const sessionItems = timeslot.sessions[sessionIndex].items
          ? timeslot.sessions[sessionIndex].items
          : timeslot.sessions[sessionIndex];
        const subSessionsLen = sessionItems.length;
        for (let subSessionIndex = 0; subSessionIndex < subSessionsLen; subSessionIndex++) {
          const sessionId = sessionItems[subSessionIndex];
          const subsession = sessionsRaw[sessionId];
          const mainTag = subsession.tags ? subsession.tags[0] : 'General';
          const endTimeRaw = timeslot.sessions[sessionIndex].extend
            ? day.timeslots[timeslotsIndex + timeslot.sessions[sessionIndex].extend - 1].endTime
            : timeslot.endTime;
          const endTime = subSessionsLen > 1
            ? getEndTime(
              day.dateReadable, timeslot.startTime, endTimeRaw, subSessionsLen, subSessionIndex + 1)
            : endTimeRaw;
          const startTime = subSessionsLen > 1 && subSessionIndex > 0
            ? sessions[sessionItems[subSessionIndex - 1]].endTime
            : timeslot.startTime;

          if (subsession.tags) {
            dayTags = [...new Set([...dayTags, ...subsession.tags])];
          }
          scheduleTags = addTagTo(scheduleTags || [], mainTag);

          const finalSubSession = Object.assign({}, subsession, {
            mainTag,
            id: sessionId.toString(),
            day: dayKey,
            track: subsession.track || day.tracks[sessionIndex],
            startTime,
            endTime,
            duration: getDuration(dayKey, startTime, endTime),
            dateReadable: day.dateReadable,
            speakers: subsession.speakers ? subsession.speakers.map((speakerId) => Object.assign({
              id: speakerId,
            }, speakersRaw[speakerId], {
              sessions: null,
            })) : [],
          });

          subSessions.push(finalSubSession);
          sessions[sessionId] = finalSubSession;
          if (subsession.speakers) {
            speakers = Object.assign(
              {},
              speakers,
              updateSpeakersSessions(speakersRaw, subsession.speakers, finalSubSession)
            );
          }
        }

        const start = `${timeslotsIndex + 1} / ${sessionIndex + 1}`;
        const end = `${timeslotsIndex
          + (timeslot.sessions[sessionIndex].extend || 0) + 1} / ${sessionsLen !== 1
          ? sessionIndex + 2 : Object.keys(extensions).length
            ? Object.keys(extensions)[0]
            : tracksNumber + 1
        }`;

        if (timeslot.sessions[sessionIndex].extend) {
          extensions[sessionIndex + 1] = timeslot.sessions[sessionIndex].extend;
        }

        innerSessions = [...innerSessions, {
          gridArea: `${start} / ${end}`,
          items: subSessions,
        }];
      }

      for (const [key, value] of Object.entries(extensions)) {
        if (value === 1) {
          delete extensions[key];
        } else {
          extensions[key] = value - 1;
        }
      }

      timeslots.push(Object.assign({}, timeslot, {
        sessions: innerSessions,
      }));
    }

    schedule = Object.assign({}, schedule, {
      days: Object.assign({}, schedule.days, {
        [dayKey]: Object.assign({}, day, {
          timeslots,
          tags: dayTags,
        }),
      }),
    });
  }

  self.postMessage({
    speakers,
    schedule,
    sessions,
  });
}, false);
