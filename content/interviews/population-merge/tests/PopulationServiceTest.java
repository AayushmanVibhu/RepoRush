package practice;

import java.util.List;
import java.util.Map;

public final class PopulationServiceTest {
    public static void main(String[] args) {
        PopulationService service = new PopulationService();
        List<CityPopulation> cities = List.of(
            new CityPopulation("GB", "London", 10),
            new CityPopulation("GB", "Oxford", 5),
            new CityPopulation("US", "Chicago", 20));
        List<CountryPopulation> remote = List.of(
            new CountryPopulation("GB", 999), new CountryPopulation("FR", 30));
        check(service.combine(cities, remote).equals(Map.of("GB", 15L, "US", 20L, "FR", 30L)));
        check(service.combine(List.of(), List.of()).isEmpty());
        check(service.combine(List.of(new CityPopulation("GB", "Empty", 0)), remote).get("GB") == 0);
        check(service.combine(List.of(new CityPopulation("XX", "A", 3_000_000_000L),
            new CityPopulation("XX", "B", 3_000_000_000L)), List.of()).get("XX") == 6_000_000_000L);
        check(cities.size() == 3 && remote.size() == 2);
        System.out.println("Population regression checks passed");
    }

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("Population merge contract violated");
    }
}
