public class ComponentTests
{
    private ComponentTestFixture testFixture;

    [Before(Test)]
    public void Setup()
    {
        testFixture = new ComponentTestFixture();
    }

    [Test]
    public void Return_a_WeatherReport_given_valid_region_and_date()
    {
        given.WeHaveAWeatherReportRequest("bristol", DateTime.Now, out var apiRequest)


    }
}        when.WeSendTheMessageToTheApi(apiRequest, out var response);        then.TheResponseCodeShouldBe(response, HttpStatusCode.OK)