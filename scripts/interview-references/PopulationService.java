package practice;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public final class PopulationService {
    public Map<String, Long> combine(List<CityPopulation> cities,
                                     List<CountryPopulation> remote) {
        Map<String, Long> totals = new TreeMap<>();
        for (CityPopulation city : cities) {
            totals.merge(city.country(), city.population(), Long::sum);
        }
        for (CountryPopulation country : remote) {
            totals.putIfAbsent(country.country(), country.population());
        }
        return totals;
    }
}
