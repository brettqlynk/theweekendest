import React from 'react';
import ReactDOM from 'react-dom';
import { Responsive, Button, Icon, Header, Segment, List, Popup, Label } from "semantic-ui-react";
import { Link, withRouter } from "react-router-dom";
import Clipboard from 'react-clipboard.js';
import { Helmet } from "react-helmet";
import * as Cookies from 'es-cookie';

import { accessibilityIcon } from './utils/accessibility.jsx';

import OverlayControls from './overlayControls.jsx';
import TrainBullet from './trainBullet.jsx';

import Cross from "./icons/cross-15.svg";

// M train directions are reversed between Essex St and Myrtle Av to match with J/Z trains
const M_TRAIN_SHUFFLE = ["M21", "M20", "M19", "M18", "M16", "M14", "M13", "M12", "M11"];

const STATIONS_EXEMPT_FROM_UPTOWN_DOWNTOWN_DIRECTIONS = new Set(
  ['901', '902', '723', '724', '725', '726', 'L06', 'L05', 'L03', 'L02', 'L01']
);
const STATIONS_EXEMPT_FROM_SOUTH_DIRECTIONS = new Set(
  ['M18']
);

const BOROUGHS = {
  "M": "Manhattan",
  "Bx": "The Bronx",
  "Bk": "Brooklyn",
  "Q": "Queens",
  "SI": "Staten Island"
}

const STREET_NANE_SUFFIXES = ['St', 'Av', 'Dr', 'Blvd', 'Rd']

class StationDetails extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fav: false };
  }

  componentDidMount() {
    const { station, handleOnMount, infoBox, handleDisplayTrainPositionsToggle } = this.props;
    const favs = Cookies.get('favs') && Cookies.get('favs').split(",");

    if (!favs || !favs.includes(station.id)) {
      this.setState({ fav: false });
    } else {
      this.setState({ fav: true });
    }

    handleOnMount(station.id);
    infoBox.classList.add('open');
    infoBox.scrollTop = 0;
  }

  componentDidUpdate(prevProps) {
    const { handleOnMount, station, infoBox, handleDisplayTrainPositionsToggle } = this.props;
    if (prevProps.station.id !== station.id) {
      handleOnMount(station.id);
      infoBox.classList.add('open');
      infoBox.scrollTop = 0;

    }
  }

  statusColor(status) {
    if (status == 'Good Service') {
      return 'green';
    } else if (status == 'Service Change') {
      return 'orange';
    } else if (status == 'Not Good' || status == 'Slow') {
      return 'yellow';
    } else if (status == 'Delay') {
      return 'red';
    }
  }

  handleBack = _ => {
    this.props.history.goBack();
  }

  handleHome = _ => {
    this.props.handleResetMap();
  }

  handleShare = _ => {
    const { station } = this.props;
    const name = `${ station.name.replace(/ - /g, "–") }${ station.secondary_name ? ` (${station.secondary_name})` : ""}`;
    navigator.share({
      title: `The Weekendest beta - ${name} Station`,
      url: `https://www.theweekendest.com/stations/${station.id}`
    });
  }

  handleStar = _ => {
    const { station } = this.props;
    const { fav } = this.state;
    const newState = !fav;
    const currentFavs = new Set(Cookies.get('favs') && Cookies.get('favs').split(","));

    if (newState) {
      currentFavs.add(station.id);
    } else {
      currentFavs.delete(station.id);
    }

    this.setState({ fav: newState });
    Cookies.set('favs', [...currentFavs].join(","), {expires: 365});

    gtag('event', 'stars', {
      'event_category': newState ? 'add' : 'remove',
      'event_label': station.id
    });
  }

  handleRealignMap = _ => {
    const { handleOnMount, station } = this.props;
    handleOnMount(station.id);
  }

  renderArrivalTimes(trainId, direction) {
    const { station, trains, stations } = this.props;
    const currentTime = Date.now() / 1000;
    let actualDirection = direction;

    if (trainId === 'M' && M_TRAIN_SHUFFLE.includes(station.id)) {
      actualDirection = direction === "north" ? "south" : "north";
    }

    if (!trains[trainId] || !trains[trainId].trips[actualDirection]) {
      return;
    }

    const destinations = new Set();
    const trainRoutingInfo = trains[trainId].actual_routings;

    trainRoutingInfo[actualDirection].forEach((routing) => {
      if (routing.includes(station.id)) {
        destinations.add(routing[routing.length - 1]);
      }
    })

    const destinationsArray = Array.from(destinations);

    const times = trains[trainId].trips[actualDirection].filter((trip) => trip.stops[station.id]).map((trip) => {
      const destination = Object.keys(trip.stops).sort((a, b) => trip.stops[b] - trip.stops[a])[0];
      return {
        id: trip.id,
        time: trip.is_delayed ? Math.max((trip.stops[station.id] - currentTime), 60) : (trip.stops[station.id]  - currentTime),
        destination: destination,
        delayed: trip.is_delayed,
        assigned: trip.is_assigned,
        scheduleDiscrepancy: trip.schedule_discrepancy,
      }
    }).sort((a, b) => a.time - b.time).filter((tripData) => tripData.time >= -59).slice(0, 2);

    if (times.length < 1) {
      return;
    }

    return times.map((estimate) => {
      const runDestination = stations[estimate.destination].name.replace(/ - /g, "–");
      const roundedTime = Math.round(estimate.time / 60);
      let timeText;

      if (estimate.assigned) {
        timeText = estimate.time <= 60 ? "Due" : `${roundedTime} min`;
      } else {
        timeText = estimate.time <= 60 ? "~0" : `~${roundedTime} min`;
      }

      if (estimate.delayed) {
        timeText = 'Delayed';
      } else if (estimate.scheduleDiscrepancy < -120 && timeText !== "Due") {
        const upperbound = Math.round((estimate.time - estimate.scheduleDiscrepancy) / 60);
        timeText = `${roundedTime} - ${upperbound} min`;
      }
      if (destinationsArray.length > 1 || estimate.destination !== destinationsArray[0]) {
        const runDestinationShort = this.shortenStationName(runDestination);
        return (
          <Link to={`/trains/${trainId}/${estimate.id.replace('..', '-')}`} key={estimate.id} title={`${trainId} Train ID: ${estimate.id} to ${runDestination}`}
            className={'station-details-train-arrival-estimation ' + (estimate.assigned ? '' : 'unassigned')}>
            {timeText} ({runDestinationShort})
          </Link>
        );
      }
      return (
        <Link to={`/trains/${trainId}/${estimate.id.replace('..', '-')}`} key={estimate.id} title={`${trainId} Train ID: ${estimate.id} to ${runDestination}`}
          className={'station-details-train-arrival-estimation ' + (estimate.assigned ? '' : 'unassigned')}>
          {timeText}
        </Link>);
    }).reduce((prev, curr) => [prev, ', ', curr]);
  }

  southDestinations(link) {
    const { trains, station } = this.props;
    let destinations = [];
    Object.keys(trains).forEach((key) => {
      const train = trains[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        train.actual_routings?.south?.forEach((routing) => {
          if (routing.includes(station.id)) {
            destinations.push(routing[routing.length - 1]);
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const train = trains["M"];
      train.actual_routings?.north?.forEach((routing) => {
        if (routing.includes(station.id)) {
          destinations.push(routing[routing.length - 1]);
        }
      })
    }

    return this.sortDestinations(destinations, link);
  }

  southDirection() {
    const { trains, stations, station } = this.props;
    const currentBorough = station.borough;

    if (STATIONS_EXEMPT_FROM_SOUTH_DIRECTIONS.has(station.id)) {
      return;
    }

    let manhattanDirection = null;
    let adjacentBoroughs = new Set();
    Object.keys(trains).forEach((key) => {
      const train = trains[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        train.actual_routings?.south?.forEach((routing) => {
          if (routing.includes(station.id)) {
            routing.slice(routing.indexOf(station.id) + 1).forEach((stationId) => {
              const s = stations[stationId];
              if (s.borough !== currentBorough) {
                adjacentBoroughs.add(s.borough);
              } else {
                if (['M', 'Bx'].includes(currentBorough) && !STATIONS_EXEMPT_FROM_UPTOWN_DOWNTOWN_DIRECTIONS.has(station.id)) {
                  if (s.latitude < station.latitude) {
                    manhattanDirection = "Downtown";
                  }
                }
              }
            });
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const train = trains["M"];
      train.actual_routings?.north?.forEach((routing) => {
        if (routing.includes(station.id)) {
          routing.slice(routing.indexOf(station.id) + 1).forEach((stationId) => {
            const s = stations[stationId];
            if (s.borough !== currentBorough) {
              adjacentBoroughs.add(s.borough);
            }
          });
        }
      })
    }

    const adjacentBoroughsArray = Array.from(adjacentBoroughs).map((b) => BOROUGHS[b] || b);

    if (manhattanDirection) {
      adjacentBoroughsArray.unshift(manhattanDirection);
    }

    if (adjacentBoroughsArray.length === 0) {
      return;
    }

    return [
      adjacentBoroughsArray.slice(0, -1).join(', '),
      adjacentBoroughsArray.slice(-1)[0]
    ].join(adjacentBoroughsArray.length < 2 ? '' : ' & ') + "—\n" ;
  }

  southStops() {
    const { station } = this.props;

    let results = Array.from(station.southStops);
    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      results = results.filter((t) => t !== 'M');

      if (station.northStops.has('M')) {
        results.push('M');
      }
    }
    return results;
  }

  northDestinations(link) {
    const { trains, station } = this.props;
    let destinations = [];
    Object.keys(trains).forEach((key) => {
      const train = trains[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        train.actual_routings?.north?.forEach((routing) => {
          if (routing.includes(station.id)) {
            destinations.push(routing[routing.length - 1]);
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const train = trains["M"];
      train.actual_routings?.south?.forEach((routing) => {
        if (routing.includes(station.id)) {
          destinations.push(routing[routing.length - 1]);
        }
      })
    }

    return this.sortDestinations(destinations, link);
  }

  northDirection() {
    const { trains, stations, station } = this.props;
    const currentBorough = station.borough;
    let manhattanDirection = null;
    let adjacentBoroughs = new Set();
    Object.keys(trains).forEach((key) => {
      const train = trains[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        train.actual_routings?.north?.forEach((routing) => {
          if (routing.includes(station.id)) {
            routing.slice(routing.indexOf(station.id) + 1).forEach((stationId) => {
              const s = stations[stationId];
              if (s.borough !== currentBorough) {
                adjacentBoroughs.add(s.borough);
              } else {
                if (['M', 'Bx'].includes(currentBorough) && !STATIONS_EXEMPT_FROM_UPTOWN_DOWNTOWN_DIRECTIONS.has(station.id)) {
                  if (s.latitude > station.latitude) {
                    manhattanDirection = "Uptown";
                  }
                }
              }
            });
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const train = trains["M"];
      train.actual_routings?.south?.forEach((routing) => {
        if (routing.includes(station.id)) {
          routing.slice(routing.indexOf(station.id) + 1).forEach((stationId) => {
            const s = stations[stationId];
            if (s.borough !== currentBorough) {
              adjacentBoroughs.add(s.borough);
            }
          });
        }
      })
    }

    const adjacentBoroughsArray = Array.from(adjacentBoroughs).map((b) => BOROUGHS[b] || b);

    if (manhattanDirection) {
      adjacentBoroughsArray.unshift(manhattanDirection);
    }

    if (adjacentBoroughsArray.length === 0) {
      return;
    }

    return [
      adjacentBoroughsArray.slice(0, -1).join(', '),
      adjacentBoroughsArray.slice(-1)[0]
    ].join(adjacentBoroughsArray.length < 2 ? '' : ' & ') + "—\n" ;
  }

  northStops() {
    const { station } = this.props;

    let results = Array.from(station.northStops);
    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      results = results.filter((t) => t !== 'M');

      if (station.southStops.has('M')) {
        results.push('M');
      }
    }
    return results;
  }

  sortDestinations(destinations, link) {
    const { stations } = this.props;

    if (destinations.length === 0) {
      return;
    }

    return Array.from(new Set(destinations)).sort((a, b) => {
      const first = stations[a].name;
      const second = stations[b].name;

      if (first < second) { return -1; }
      if (first > second) { return 1; }
      return 0;
    }).map((s) => {
      const st = stations[s];
      if (st) {
        if (!link) {
          return st.name.replace(/ - /g, "–");
        }
        return (
          <Link to={`/stations/${st.id}`} key={st.id}>
            { st.name.replace(/ - /g, "–") }
          </Link>
        );
      }
    }).reduce((prev, curr) => [prev, ', ', curr]);
  }

  shortenStationName(stationName) {
    const stationNameArray = stationName.split('–');
    if (stationNameArray.length === 1) {
      return stationNameArray[0];
    }
    if (stationNameArray[0] === 'W 4 St') {
      return stationNameArray[0];
    } else if (stationNameArray[0].endsWith('Sq')) {
      return stationNameArray[0];
    } else if (stationNameArray[1].endsWith('Sq')) {
      return stationNameArray[1];
    } else if (STREET_NANE_SUFFIXES.some((s) => stationNameArray[0].endsWith(s)) && STREET_NANE_SUFFIXES.some((s) => stationNameArray[1].endsWith(s))) {
      return stationName;
    } else if (['Far Rockaway', 'Rockaway Park'].includes(stationNameArray[0])) {
      return stationNameArray[0];
    } else if (stationNameArray[0] === 'Jamaica' || stationNameArray[0] === 'Mets') {
      return stationName;
    } else if (STREET_NANE_SUFFIXES.some((s) => stationNameArray[1].endsWith(s))) {
      return stationNameArray[1];
    }
    return stationNameArray[0];
  }

  renderOverlayControls() {
    const { displayProblems, displayDelays, displaySlowSpeeds, displayLongHeadways, displayTrainPositions, displayAccessibleOnly,
      handleDisplayProblemsToggle, handleDisplayDelaysToggle, handleDisplaySlowSpeedsToggle, handleDisplayLongHeadwaysToggle, handleDisplayAccessibleOnlyToggle,
      handleDisplayTrainPositionsToggle } = this.props;
    return (
      <Popup trigger={<Button icon='sliders horizontal' title="Configure overlays" />}
            on='click' hideOnScroll position='bottom center' style={{maxWidth: "195px"}}>
        <OverlayControls displayProblems={displayProblems} displayDelays={displayDelays} displaySlowSpeeds={displaySlowSpeeds}
            displayLongHeadways={displayLongHeadways} displayTrainPositions={displayTrainPositions} displayAccessibleOnly={displayAccessibleOnly}
            handleDisplayProblemsToggle={handleDisplayProblemsToggle} handleDisplayAccessibleOnlyToggle={handleDisplayAccessibleOnlyToggle}
            handleDisplayDelaysToggle={handleDisplayDelaysToggle} handleDisplaySlowSpeedsToggle={handleDisplaySlowSpeedsToggle}
            handleDisplayLongHeadwaysToggle={handleDisplayLongHeadwaysToggle}
            handleDisplayTrainPositionsToggle={handleDisplayTrainPositionsToggle}
            alwaysExpand={true} />
      </Popup>
    )
  }

  render() {
    const { stations, station, trains, accessibleStations, elevatorOutages } = this.props;
    const { fav } = this.state;
    const name = `${ station.name.replace(/ - /g, "–") }${ station.secondary_name ? ` (${station.secondary_name})` : ""}`;
    const title = `The Weekendest beta - ${name} Station`;
    return (
      <Segment className='details-pane'>
        <Helmet>
          <title>{title}</title>
          <meta property="og:title" content={`${name} Station`} />
          <meta name="twitter:title" content={title} />
          <meta property="og:url" content={`https://www.theweekendest.com/stations/${station.id}`} />
          <meta name="twitter:url" content={`https://www.theweekendest.com/stations/${station.id}`} />
          <meta property="og:description" content={`Check service status, and real-time train arrival times for ${name} Station on the New York City subway.`} />
          <meta name="twitter:description" content={`Check service status, and real-time train arrival times for ${name} Station on the New York City subway.`} />
          <link rel="canonical" href={`https://www.theweekendest.com/stations/${station.id}`} />
          <meta name="Description" content={`Check service status, and real-time train arrival times for ${name} Station on the New York City subway.`} />
        </Helmet>
        <Responsive minWidth={Responsive.onlyTablet.minWidth} as='div' style={{padding: "14px"}}>
          <Button icon onClick={this.handleBack} title="Back">
            <Icon name='arrow left' />
          </Button>
          <Button icon onClick={this.handleHome} title="Home">
            <Icon name='map outline' />
          </Button>
          <Button icon title="Center map" onClick={this.handleRealignMap}>
            <Icon name='crosshairs' />
          </Button>
          {
            this.renderOverlayControls()
          }
          <Button icon onClick={this.handleStar} title={ fav ? 'Remove station from favorites' : 'Add station to favorites'}>
            <Icon name={ fav ? 'star' : 'star outline'} />
          </Button>
          { navigator.share &&
            <Button icon onClick={this.handleShare} style={{float: "right"}} title="Share">
              <Icon name='external share' />
            </Button>
          }
          <Clipboard component={Button} className="icon right" title="Copy Link" data-clipboard-text={`https://www.theweekendest.com/stations/${this.props.station.id}`}>
            <Icon name='linkify' />
          </Clipboard>
          <Header as="h3" className='header-station-name'>
            { station.name.replace(/ - /g, "–") }
            { accessibilityIcon(accessibleStations, elevatorOutages, station.id) }
          </Header>
          { station.secondary_name &&
            <span className='header-secondary-name'>
              {
                station.secondary_name
              }
            </span>
          }
          {
            accessibleStations.north.includes(station.id) && !accessibleStations.south.includes(station.id) &&
            <div>
              <Icon name='accessible' color='blue' title='This station is accessible' />
              { this.northDirection()?.slice(0, -2) || ((this.northDestinations(false) || "North") + '-bound') }-only
            </div>
          }
          {
            !accessibleStations.north.includes(station.id) && accessibleStations.south.includes(station.id) &&
            <div>
              <Icon name='accessible' color='blue' title='This station is accessible' />
              { this.southDirection()?.slice(0, -2) || ((this.southDestinations(false) || "South") + '-bound') }-only
            </div>
          }
          {
            elevatorOutages[station.id] &&
            <div className='elevator-outages'>
              {
                elevatorOutages[station.id].filter((value, index, self) => self.indexOf(value) === index).map((outage, i) => {
                return (<h5 key={i}>Elevator for {outage} is out of service.</h5>);
              })
              }
              <h5>For more info, see <a href='https://new.mta.info/elevator-escalator-status' target='_blank'>mta.info</a>.</h5>
            </div>
          }
        </Responsive>
        <Responsive {...Responsive.onlyMobile} as='div' className="mobile-details-header">
          <Popup trigger={<Button icon='ellipsis horizontal' title="More Options..." />} inverted flowing
            on='click' hideOnScroll position='bottom left'>
            <Button icon onClick={this.handleBack} title="Back">
              <Icon name='arrow left' />
            </Button>
            <Button icon onClick={this.handleHome} title="Home">
              <Icon name='map outline' />
            </Button>
            {
              this.renderOverlayControls()
            }
            <Button icon onClick={this.handleStar} title={ fav ? 'Remove station from favorites' : 'Add station to favorites'}>
              <Icon name={ fav ? 'star' : 'star outline'} />
            </Button>
            <Clipboard component={Button} className="icon" title="Copy Link" data-clipboard-text={`https://www.theweekendest.com/stations/${this.props.station.id}`}>
              <Icon name='linkify' />
            </Clipboard>
            { navigator.share &&
              <Button icon onClick={this.handleShare} title="Share">
                <Icon name='external share' />
              </Button>
            }
          </Popup>
          <Header as="h5" style={{margin: 0, flexGrow: 1, maxHeight: "36px", overflow: "hidden"}}>
            { station.name.replace(/ - /g, "–") }
            { accessibilityIcon(accessibleStations, elevatorOutages, station.id) }
            <span className='header-secondary-name'>
              { station.secondary_name }
            </span>
          </Header>
          <Button icon title="Center map" onClick={this.handleRealignMap}>
            <Icon name='crosshairs' />
          </Button>
        </Responsive>
        {
          accessibleStations.north.includes(station.id) && !accessibleStations.south.includes(station.id) &&
          <Responsive {...Responsive.onlyMobile} as='div' className='details-body'>
            <Icon name='accessible' color='blue' title='This station is accessible' />
            { this.northDirection()?.slice(0, -2) || ((this.northDestinations(false) || "North") + '-bound') }-only
          </Responsive>
        }
        {
          !accessibleStations.north.includes(station.id) && accessibleStations.south.includes(station.id) &&
          <Responsive {...Responsive.onlyMobile} as='div' className='details-body'>
            <Icon name='accessible' color='blue' title='This station is accessible' />
            { this.southDirection()?.slice(0, -2) || ((this.southDestinations(false) || "South") + '-bound') }-only
          </Responsive>
        }
        {
          elevatorOutages[station.id] &&
            <Responsive {...Responsive.onlyMobile} as='div' className='details-body elevator-outages'>
              {
                elevatorOutages[station.id].filter((value, index, self) => self.indexOf(value) === index).map((outage, i) => {
                return (<h5 key={i}>Elevator for {outage} is out of service.</h5>);
              })
              }
              <h5>For more info, see <a href='https://new.mta.info/elevator-escalator-status' target='_blank'>mta.info</a>.</h5>
            </Responsive>
          }
        <div className="details-body">
          <Segment>
            <Header as="h5" style={{whiteSpace: "pre-line"}}>
              { this.northDirection() }To { this.northDestinations(true) }
            </Header>
            <div>
              <List divided relaxed className="stop-times">
                {
                  this.northStops().sort().map((trainId) => {
                    const train = trains[trainId];
                    return (
                      <List.Item key={trainId}>
                        <List.Content floated='left' className="bullet-container">
                          <TrainBullet name={train.name} id={trainId} color={train.color}
                            textColor={train.text_color} size='small' link />
                        </List.Content>
                        { train.alternate_name &&
                          <Link to={`/trains/${trainId}/`}>
                            <List.Content floated='left' className="alternate-name">
                              { train.alternate_name.replace(" Shuttle", "") }
                            </List.Content>
                          </Link>
                        }
                        <List.Content floated='right' className="station-details-route-status">
                          <Header as="h5">
                            { this.renderArrivalTimes(trainId, "north")}
                          </Header>
                          {
                            (trainId !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) &&
                            <Link to={`/trains/${trainId}/`}>
                              <Header as='h4' color={this.statusColor(train.direction_statuses.north)}>
                                { train.direction_statuses.north }
                              </Header>
                            </Link>
                          }
                          {
                            trainId === 'M' && M_TRAIN_SHUFFLE.includes(station.id) &&
                            <Link to={`/trains/${trainId}/`}>
                              <Header as='h4' color={this.statusColor(train.direction_statuses.south)}>
                                { train.direction_statuses.south }
                              </Header>
                            </Link>
                          }
                        </List.Content>
                      </List.Item>
                    );
                  })
                }
              </List>
            </div>
          </Segment>
          <Segment>
            <Header as="h5" style={{whiteSpace: "pre-line"}}>
              { this.southDirection() }To { this.southDestinations(true) }
            </Header>
            <div>
              <List divided relaxed className="stop-times">
                {
                  this.southStops().sort().map((trainId) => {
                    const train = trains[trainId];
                    return (
                      <List.Item key={trainId}>
                        <List.Content floated='left' className="bullet-container">
                          <TrainBullet name={train.name} id={trainId} color={train.color}
                            textColor={train.text_color} size='small' link />
                        </List.Content>
                        { train.alternate_name &&
                          <Link to={`/trains/${trainId}/`}>
                            <List.Content floated='left' className="alternate-name">
                              { train.alternate_name.replace(" Shuttle", "") }
                            </List.Content>
                          </Link>
                        }
                        <List.Content floated='right' className="station-details-route-status">
                          <Header as="h5">
                            { this.renderArrivalTimes(trainId, "south") }
                          </Header>
                          {
                            (trainId !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) &&
                            <Link to={`/trains/${trainId}/`}>
                              <Header as='h4' color={this.statusColor(train.direction_statuses.south)}>
                                { train.direction_statuses.south }
                              </Header>
                            </Link>
                          }
                          {
                            trainId === 'M' && M_TRAIN_SHUFFLE.includes(station.id) &&
                            <Link to={`/trains/${trainId}/`}>
                              <Header as='h4' color={this.statusColor(train.direction_statuses.north)}>
                                { train.direction_statuses.north }
                              </Header>
                            </Link>
                          }
                        </List.Content>
                      </List.Item>
                    );
                  })
                }
              </List>
            </div>
          </Segment>
          {
            (station.transfers.size > 0 || station.busTransfers.length > 0 || station.connections.length > 0) &&
            <Segment className="transfers">
              <Header as="h4">
                Transfers
              </Header>
              <List divided relaxed selection>
              {
                Array.from(station.transfers).map((stopId) => {
                  const stop = stations[stopId];
                  if (!stop) {
                    return;
                  }
                  return(
                    <List.Item as={Link} key={stop.id} className='station-list-item' to={`/stations/${stop.id}`}>
                      <List.Content floated='left'>
                        <Header as='h5'>
                          { stop.name.replace(/ - /g, "–") }
                        </Header>
                      </List.Content>
                      { stop.secondary_name &&
                        <List.Content floated='left' className="secondary-name">
                          { stop.secondary_name }
                        </List.Content>
                      }
                      <List.Content floated='left' className="accessibility-icon">
                        { accessibilityIcon(accessibleStations, elevatorOutages, stop.id) }
                      </List.Content>
                      <List.Content floated='right'>
                        {
                          Array.from(stop.stops).sort().map((trainId) => {
                            const train = trains[trainId];
                            const directions = [];
                            if (stop.northStops.has(trainId)) {
                              directions.push("north")
                            }
                            if (stop.southStops.has(trainId)) {
                              directions.push("south")
                            }
                            return (
                              <TrainBullet id={trainId} key={train.name} name={train.name} color={train.color}
                                textColor={train.text_color} size='small' key={train.id} directions={directions} />
                            )
                          })
                        }
                        {
                          stop.stops.size === 0 &&
                          <Cross style={{height: "21px", width: "21px", margin: "3.5px 1px 3.5px 3.5px"}} />
                        }
                      </List.Content>
                    </List.Item>
                  )
                })
              }
              {
                ((station.busTransfers.length > 0) || (station.connections.length > 0)) &&
                <List.Item key="others" className='others'>
                  {
                    station.busTransfers?.map((b) => {
                      return (
                        <Label key={b.route} color={b.sbs ? 'blue' : 'grey'} size='small'>
                          <Icon name={b.airport_connection ? 'plane' : 'bus'} />
                          {b.route}
                        </Label>
                      );
                    })
                  }
                  {
                    station.connections?.map((c) => {
                      return (
                        <Label key={c.name} basic size='small'>
                          <Icon name={c.mode} />
                          {c.name}
                        </Label>
                      );
                    })
                  }
                </List.Item>
              }
            </List>
            </Segment>
          }
        </div>
      </Segment>
    );
  }
}

export default withRouter(StationDetails)