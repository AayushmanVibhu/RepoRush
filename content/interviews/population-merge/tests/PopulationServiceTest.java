package practice;

import java.util.List;
import java.util.Map;

public final class PopulationServiceTest {

    private static int failed = 0;

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
    }

    private static void run(String name, Runnable test) {
        boolean pass = true;
        String diagnostic = "";
        try { test.run(); }
        catch (Throwable error) {
            pass = false;
            failed++;
            java.io.StringWriter trace = new java.io.StringWriter();
            error.printStackTrace(new java.io.PrintWriter(trace));
            diagnostic = trace.toString();
        }
        System.out.println("REP0_TEST {\"name\":" + quote(name) + ",\"pass\":" + pass + ",\"diagnostic\":" + quote(diagnostic) + "}");
    }

    public static void main(String[] args) {
        PopulationService service = new PopulationService();
        List<CityPopulation> cities = List.of(
            new CityPopulation("GB", "London", 10),
            new CityPopulation("GB", "Oxford", 5),
            new CityPopulation("US", "Chicago", 20));
        List<CountryPopulation> remote = List.of(
            new CountryPopulation("GB", 999), new CountryPopulation("FR", 30));
        run("Sums city populations and prefers local totals", () -> {
            equal(Map.of("GB", 15L, "US", 20L, "FR", 30L), service.combine(cities, remote));
        });
        run("Returns an empty map for empty inputs", () -> {
            equal(Map.of(), service.combine(List.of(), List.of()));
        });
        run("Preserves a local zero instead of the remote total", () -> {
            equal(0L, service.combine(List.of(new CityPopulation("GB", "Empty", 0)), remote).get("GB"));
        });
        run("Handles population totals above the 32-bit limit", () -> {
            equal(6_000_000_000L, service.combine(List.of(new CityPopulation("XX", "A", 3_000_000_000L),
                new CityPopulation("XX", "B", 3_000_000_000L)), List.of()).get("XX"));
        });
        run("Keeps the input lists unchanged", () -> {
            var beforeCities = List.copyOf(cities);
            var beforeRemote = List.copyOf(remote);
            service.combine(cities, remote);
            equal(beforeCities, cities);
            equal(beforeRemote, remote);
        });
        if (failed > 0) System.exit(1);
    }

    private static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError("Expected: " + expected + "\nActual: " + actual);
    }
}
